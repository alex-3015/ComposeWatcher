import semver from 'semver';
import type {
  BreakingChange,
  CheckIssue,
  ComparisonMode,
  ContainerInfo,
  ContainerStatus,
  GithubRateLimit,
  GithubRelease,
  UpdateKind,
} from '../types.js';
import {
  loadGithubCache,
  saveGithubCache,
  type CachedGithubRelease,
  type GithubCacheData,
  type GithubRepositoryCacheEntry,
} from './githubCacheService.js';
import { consoleServiceLogger, type ServiceLogger } from './serviceLogger.js';

const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 20;
const RELEASE_LIMIT = 100;
const REPO_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const PRERELEASE_RE = /(?:^|[-_.])(alpha|beta|rc|preview|pre|dev|nightly)(?:[-_.]|\d|$)/i;

const BREAKING_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bbreaking[\s_-]+changes?\b/i, label: 'breaking change' },
  { pattern: /\bmigration\s+required\b/i, label: 'migration required' },
  { pattern: /\bnot\s+(?:backward|backwards)\s+compatible\b/i, label: 'not backward compatible' },
  { pattern: /\bmanual\s+intervention\s+required\b/i, label: 'manual intervention required' },
  { pattern: /\bnicht\s+abwärtskompatibel\b/i, label: 'nicht abwärtskompatibel' },
];

interface ParsedVersion {
  segments: number[];
  suffix: string;
  channel: 'stable' | 'prerelease';
  exactSemver: boolean;
}

type ReleaseFetchResult =
  | {
      releases: CachedGithubRelease[];
      issue: null;
      stale: false;
      checkedAt: string;
      historyMayBeTruncated: boolean;
    }
  | {
      releases: CachedGithubRelease[];
      issue: CheckIssue;
      stale: boolean;
      checkedAt: string | null;
      historyMayBeTruncated: boolean;
    };

export interface EnrichmentResult {
  containers: ContainerInfo[];
  githubRateLimit: GithubRateLimit | null;
}

function getConcurrency(): number {
  const configured = Number(process.env.GITHUB_CONCURRENCY);
  if (!Number.isInteger(configured) || configured < 1) return DEFAULT_CONCURRENCY;
  return Math.min(configured, MAX_CONCURRENCY);
}

function getGithubHeaders(etag: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ComposeWatcher/2.1',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  if (etag) headers['If-None-Match'] = etag;
  return headers;
}

function isGithubRelease(value: unknown): value is GithubRelease {
  if (typeof value !== 'object' || value === null) return false;
  const release = value as Record<string, unknown>;
  return (
    typeof release.tag_name === 'string' &&
    release.tag_name.length > 0 &&
    (typeof release.name === 'string' || release.name === null) &&
    (typeof release.body === 'string' || release.body === null) &&
    typeof release.html_url === 'string' &&
    typeof release.published_at === 'string' &&
    typeof release.prerelease === 'boolean' &&
    typeof release.draft === 'boolean'
  );
}

function issue(
  code: CheckIssue['code'],
  message: string,
  retryAt: string | null = null,
): CheckIssue {
  return { code, message, retryAt };
}

function parseVersion(value: string): ParsedVersion | null {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.length === 0 ||
    lower === 'latest' ||
    lower.startsWith('sha256:') ||
    lower.includes('${')
  ) {
    return null;
  }

  const match = trimmed.match(/^[vV]?(\d+(?:\.\d+){0,3})(.*)$/);
  if (!match) return null;
  const segments = match[1].split('.').map(Number);
  if (segments.some((segment) => !Number.isSafeInteger(segment))) return null;
  const suffix = match[2];
  const channel = PRERELEASE_RE.test(suffix) ? 'prerelease' : 'stable';
  const semverCandidate = trimmed.replace(/^[vV]/, '');
  const exactSemver =
    semver.valid(semverCandidate) !== null && (suffix.length === 0 || channel === 'prerelease');
  return { segments, suffix, channel, exactSemver };
}

function compareSegments(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length, 3);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function prereleaseRank(suffix: string): [number, number] {
  const match = suffix.match(PRERELEASE_RE);
  if (!match) return [0, 0];
  const ranks: Record<string, number> = {
    dev: 0,
    nightly: 0,
    alpha: 1,
    beta: 2,
    pre: 3,
    preview: 3,
    rc: 4,
  };
  const numberMatch = suffix.slice(match.index ?? 0).match(/\d+/);
  return [ranks[match[1].toLowerCase()] ?? 0, numberMatch ? Number(numberMatch[0]) : 0];
}

function compareParsedVersions(left: ParsedVersion, right: ParsedVersion): number {
  const core = compareSegments(left.segments, right.segments);
  if (core !== 0) return core;
  if (left.channel === 'prerelease' && right.channel === 'prerelease') {
    const leftRank = prereleaseRank(left.suffix);
    const rightRank = prereleaseRank(right.suffix);
    return leftRank[0] - rightRank[0] || leftRank[1] - rightRank[1];
  }
  return 0;
}

function getBreakingReasons(release: GithubRelease): string[] {
  const bodyWithoutCode = (release.body ?? '').replace(/```[\s\S]*?```/g, ' ');
  const text = `${release.name ?? ''}\n${bodyWithoutCode}`
    .replace(/\b(?:no|not\s+(?:a|an))\s+breaking[\s_-]+changes?\b/gi, ' ')
    .replace(/\bno\s+migration\s+(?:is\s+)?required\b/gi, ' ');
  return BREAKING_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ label }) => `Release notes mention: "${label}"`,
  );
}

function toCachedReleases(rawReleases: GithubRelease[]): CachedGithubRelease[] {
  const releases = rawReleases
    .filter((release) => !release.draft && parseVersion(release.tag_name) !== null)
    .flatMap((release) => {
      const parsed = parseVersion(release.tag_name);
      if (!parsed) return [];
      return {
        tagName: release.tag_name,
        name: release.name,
        body: release.body,
        url: release.html_url,
        publishedAt: release.published_at,
        prerelease: release.prerelease || parsed.channel === 'prerelease',
        breakingReasons: getBreakingReasons(release),
      } satisfies CachedGithubRelease;
    });

  const newestByChannel = new Set<string>();
  for (const prerelease of [false, true]) {
    const newest = selectLatestRelease(
      releases.filter((release) => release.prerelease === prerelease),
    );
    if (newest) newestByChannel.add(newest.tagName);
  }

  return releases.map((release) => ({
    ...release,
    body: newestByChannel.has(release.tagName) ? release.body : null,
  }));
}

function selectLatestRelease(releases: CachedGithubRelease[]): CachedGithubRelease | null {
  return (
    releases.reduce<CachedGithubRelease | null>((latest, release) => {
      const parsed = parseVersion(release.tagName);
      if (!parsed) return latest;
      if (!latest) return release;
      const latestParsed = parseVersion(latest.tagName);
      return !latestParsed || compareParsedVersions(parsed, latestParsed) > 0 ? release : latest;
    }, null) ?? null
  );
}

function parseRateLimit(headers: Headers): GithubRateLimit | null {
  const limitHeader = headers.get('x-ratelimit-limit');
  const remainingHeader = headers.get('x-ratelimit-remaining');
  const resetHeader = headers.get('x-ratelimit-reset');
  if (limitHeader === null || remainingHeader === null || resetHeader === null) return null;
  const limit = Number(limitHeader);
  const remaining = Number(remainingHeader);
  const reset = Number(resetHeader);
  if (
    ![limit, remaining, reset].every(Number.isFinite) ||
    limit < 0 ||
    remaining < 0 ||
    reset < 0
  ) {
    return null;
  }
  const resetDate = new Date(reset * 1000);
  if (Number.isNaN(resetDate.getTime())) return null;
  return {
    limit,
    remaining,
    resetAt: resetDate.toISOString(),
    observedAt: new Date().toISOString(),
  };
}

function getRetryAt(headers: Headers | undefined): string | null {
  if (!headers) return null;
  const retryAfterHeader = headers.get('retry-after');
  const retryAfter = Number(retryAfterHeader);
  if (retryAfterHeader !== null && Number.isFinite(retryAfter) && retryAfter >= 0) {
    return new Date(Date.now() + retryAfter * 1000).toISOString();
  }
  const resetHeader = headers.get('x-ratelimit-reset');
  const reset = Number(resetHeader);
  if (resetHeader !== null && Number.isFinite(reset) && reset > 0) {
    return new Date(reset * 1000).toISOString();
  }
  return new Date(Date.now() + 60_000).toISOString();
}

function errorForStatus(status: number, headers: Headers): CheckIssue {
  if (status === 404) return issue('repo-not-found', 'Repository or releases not found.');
  if (status === 403 || status === 429) {
    return issue('rate-limited', 'GitHub API rate limit reached.', getRetryAt(headers));
  }
  return issue('github-error', `GitHub API returned HTTP ${status}.`);
}

function resultFromFailure(
  entry: GithubRepositoryCacheEntry | undefined,
  checkIssue: CheckIssue,
): ReleaseFetchResult {
  return {
    releases: entry?.releases ?? [],
    issue: checkIssue,
    stale: Boolean(entry?.releases.length),
    checkedAt: entry?.checkedAt ?? null,
    historyMayBeTruncated: entry?.historyMayBeTruncated ?? false,
  };
}

async function fetchRepository(
  repository: string,
  cache: GithubCacheData,
): Promise<ReleaseFetchResult> {
  const entry = cache.repositories[repository];
  if (!REPO_REGEX.test(repository)) {
    return resultFromFailure(entry, issue('github-error', 'Invalid GitHub repository mapping.'));
  }

  if (entry?.retryAt && new Date(entry.retryAt).getTime() > Date.now()) {
    return resultFromFailure(
      entry,
      issue('rate-limited', 'GitHub API rate limit reached.', entry.retryAt),
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/releases?per_page=${RELEASE_LIMIT}`,
      {
        headers: getGithubHeaders(entry?.etag ?? null),
        signal: controller.signal,
      },
    );
    const observedRateLimit = parseRateLimit(response.headers);
    if (
      observedRateLimit &&
      (!cache.rateLimit ||
        observedRateLimit.resetAt > cache.rateLimit.resetAt ||
        (observedRateLimit.resetAt === cache.rateLimit.resetAt &&
          observedRateLimit.remaining < cache.rateLimit.remaining))
    ) {
      cache.rateLimit = observedRateLimit;
    }

    if (response.status === 304 && entry?.releases.length) {
      entry.checkedAt = new Date().toISOString();
      entry.retryAt = null;
      return {
        releases: entry.releases,
        issue: null,
        stale: false,
        checkedAt: entry.checkedAt,
        historyMayBeTruncated: entry.historyMayBeTruncated,
      };
    }

    if (!response.ok) {
      const checkIssue = errorForStatus(response.status, response.headers);
      if (checkIssue.code === 'rate-limited') {
        cache.repositories[repository] = {
          etag: entry?.etag ?? null,
          releases: entry?.releases ?? [],
          checkedAt: entry?.checkedAt ?? null,
          retryAt: checkIssue.retryAt,
          historyMayBeTruncated: entry?.historyMayBeTruncated ?? false,
        };
      }
      return resultFromFailure(cache.repositories[repository] ?? entry, checkIssue);
    }

    const parsed: unknown = await response.json();
    if (!Array.isArray(parsed)) {
      return resultFromFailure(
        entry,
        issue('invalid-release', 'GitHub returned an invalid releases response.'),
      );
    }
    const validReleases = parsed.filter(isGithubRelease);
    const releases = toCachedReleases(validReleases);
    if (releases.length === 0) {
      return resultFromFailure(
        entry,
        issue('invalid-release', 'GitHub returned no comparable published releases.'),
      );
    }

    const checkedAt = new Date().toISOString();
    cache.repositories[repository] = {
      etag: response.headers.get('etag'),
      releases,
      checkedAt,
      retryAt: null,
      historyMayBeTruncated: parsed.length >= RELEASE_LIMIT,
    };
    return {
      releases,
      issue: null,
      stale: false,
      checkedAt,
      historyMayBeTruncated: parsed.length >= RELEASE_LIMIT,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return resultFromFailure(entry, issue('timeout', 'GitHub request timed out.'));
    }
    if (error instanceof TypeError) {
      return resultFromFailure(entry, issue('network', 'GitHub could not be reached.'));
    }
    return resultFromFailure(entry, issue('github-error', 'GitHub request failed unexpectedly.'));
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchUniqueRepositories(
  repositories: string[],
  cache: GithubCacheData,
): Promise<Map<string, ReleaseFetchResult>> {
  const results = new Map<string, ReleaseFetchResult>();
  let nextIndex = 0;
  const workerCount = Math.min(getConcurrency(), repositories.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < repositories.length) {
        const repository = repositories[nextIndex++];
        results.set(repository, await fetchRepository(repository, cache));
      }
    }),
  );
  return results;
}

function getComparisonMode(current: ParsedVersion, latest: ParsedVersion): ComparisonMode {
  return current.exactSemver && latest.exactSemver ? 'exact' : 'normalized';
}

function getUpdateKind(current: ParsedVersion, latest: ParsedVersion): UpdateKind {
  if (current.channel === 'prerelease' || latest.channel === 'prerelease') return 'prerelease';
  if ((current.segments[0] ?? 0) !== (latest.segments[0] ?? 0)) return 'major';
  if ((current.segments[1] ?? 0) !== (latest.segments[1] ?? 0)) return 'minor';
  return 'patch';
}

function getHistoryComplete(
  releases: CachedGithubRelease[],
  current: ParsedVersion,
  historyMayBeTruncated: boolean,
): boolean {
  if (!historyMayBeTruncated) return true;
  const comparable = releases
    .filter((release) => release.prerelease === (current.channel === 'prerelease'))
    .map((release) => parseVersion(release.tagName))
    .filter((version): version is ParsedVersion => version !== null);
  return comparable.some((version) => compareParsedVersions(version, current) <= 0);
}

function getBreakingChanges(
  releases: CachedGithubRelease[],
  current: ParsedVersion,
  latest: ParsedVersion,
  currentLabel: string,
  latestRelease: CachedGithubRelease,
  updateKind: UpdateKind,
): BreakingChange[] {
  const changes: BreakingChange[] = [];
  if (updateKind === 'major') {
    changes.push({
      version: latestRelease.tagName,
      releaseName: latestRelease.name,
      reason: `Major version bump: ${currentLabel} → ${latestRelease.tagName}`,
      releaseUrl: latestRelease.url,
    });
  }

  for (const release of releases) {
    if (release.prerelease !== (current.channel === 'prerelease')) continue;
    const parsed = parseVersion(release.tagName);
    if (
      !parsed ||
      compareParsedVersions(parsed, current) <= 0 ||
      compareParsedVersions(parsed, latest) > 0
    ) {
      continue;
    }
    for (const reason of release.breakingReasons) {
      changes.push({
        version: release.tagName,
        releaseName: release.name,
        reason,
        releaseUrl: release.url,
      });
    }
  }

  return changes.filter(
    (change, index, all) =>
      all.findIndex(
        (candidate) => candidate.version === change.version && candidate.reason === change.reason,
      ) === index,
  );
}

function enrichContainer(container: ContainerInfo, result: ReleaseFetchResult): ContainerInfo {
  const current = parseVersion(container.currentVersion);
  if (!current) {
    return {
      ...container,
      status: 'unknown',
      comparisonMode: 'unverifiable',
      checkIssue: issue(
        'unverifiable-version',
        'The configured image tag cannot be compared reliably.',
      ),
      releaseDataStale: result.stale,
      lastChecked: result.checkedAt,
    };
  }

  const channelReleases = result.releases.filter(
    (release) => release.prerelease === (current.channel === 'prerelease'),
  );
  const latestRelease = selectLatestRelease(channelReleases);
  if (!latestRelease) {
    return {
      ...container,
      status: 'unknown',
      comparisonMode: 'unverifiable',
      checkIssue: result.issue ?? issue('invalid-release', 'No release exists for this channel.'),
      releaseDataStale: result.stale,
      lastChecked: result.checkedAt,
    };
  }

  const latest = parseVersion(latestRelease.tagName);
  if (!latest) {
    return {
      ...container,
      status: 'unknown',
      comparisonMode: 'unverifiable',
      checkIssue: issue('invalid-release', 'The selected upstream release is not comparable.'),
      releaseDataStale: result.stale,
      lastChecked: result.checkedAt,
    };
  }
  const comparison = compareParsedVersions(current, latest);
  const updateKind = comparison < 0 ? getUpdateKind(current, latest) : null;
  const breakingChanges =
    comparison < 0
      ? getBreakingChanges(
          channelReleases,
          current,
          latest,
          container.currentVersion,
          latestRelease,
          updateKind,
        )
      : [];
  let status: ContainerStatus;
  if (comparison > 0) status = 'ahead';
  else if (comparison === 0) status = 'up-to-date';
  else if (breakingChanges.length > 0) status = 'breaking-change';
  else status = 'update-available';

  return {
    ...container,
    latestUpstreamVersion: latestRelease.tagName,
    publishedAt: latestRelease.publishedAt,
    status,
    updateKind,
    comparisonMode: getComparisonMode(current, latest),
    historyComplete: getHistoryComplete(channelReleases, current, result.historyMayBeTruncated),
    releaseDataStale: result.stale,
    checkIssue: result.issue,
    breakingChanges,
    releaseUrl: latestRelease.url,
    releaseNotes: latestRelease.body,
    releaseName: latestRelease.name,
    lastChecked: result.checkedAt,
  };
}

/** Enriches containers with one bounded, cached GitHub request per unique repository. */
export async function enrichWithGithubData(
  containers: ContainerInfo[],
  logger: ServiceLogger = consoleServiceLogger,
): Promise<EnrichmentResult> {
  const repositories = [
    ...new Set(
      containers.flatMap((container) => (container.githubRepo ? [container.githubRepo] : [])),
    ),
  ];
  const cache = loadGithubCache(logger);
  const releaseResults = await fetchUniqueRepositories(repositories, cache);
  if (repositories.length > 0) {
    try {
      saveGithubCache(cache);
    } catch (error) {
      logger.warn({ error }, 'Failed to persist GitHub cache');
    }
  }

  return {
    githubRateLimit: cache.rateLimit,
    containers: containers.map((container) => {
      if (!container.githubRepo) {
        return {
          ...container,
          status: 'no-repo',
          comparisonMode: 'unverifiable',
          checkIssue: null,
        };
      }
      const result = releaseResults.get(container.githubRepo);
      if (!result) {
        return {
          ...container,
          status: 'unknown',
          comparisonMode: 'unverifiable',
          checkIssue: issue('github-error', 'GitHub check did not complete.'),
        };
      }
      if (result.issue) {
        logger.warn(
          { repository: container.githubRepo, code: result.issue.code },
          'GitHub check failed',
        );
      }
      if (result.releases.length === 0) {
        return {
          ...container,
          status: 'unknown',
          comparisonMode: 'unverifiable',
          releaseDataStale: result.stale,
          checkIssue: result.issue,
          lastChecked: result.checkedAt,
        };
      }
      return enrichContainer(container, result);
    }),
  };
}
