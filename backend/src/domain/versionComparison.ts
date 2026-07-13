import semver from 'semver';
import type {
  BreakingChange,
  CheckIssue,
  ComparisonMode,
  ContainerInfo,
  ContainerStatus,
  GithubRelease,
  UpdateKind,
} from '../types.js';
import type { CachedGithubRelease } from '../services/githubCacheService.js';

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

export interface RepositoryReleaseResult {
  releases: CachedGithubRelease[];
  issue: CheckIssue | null;
  stale: boolean;
  checkedAt: string | null;
  historyMayBeTruncated: boolean;
}

export function createCheckIssue(
  code: CheckIssue['code'],
  message: string,
  retryAt: string | null = null,
): CheckIssue {
  return { code, message, retryAt };
}

function parseVersion(value: string): ParsedVersion | null {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (!lower || lower === 'latest' || lower.startsWith('sha256:') || lower.includes('${')) {
    return null;
  }
  const match = trimmed.match(/^[vV]?(\d+(?:\.\d+){0,3})(.*)$/);
  if (!match) return null;
  const segments = match[1].split('.').map(Number);
  if (segments.some((segment) => !Number.isSafeInteger(segment))) return null;
  const suffix = match[2];
  const channel = PRERELEASE_RE.test(suffix) ? 'prerelease' : 'stable';
  const candidate = trimmed.replace(/^[vV]/, '');
  return {
    segments,
    suffix,
    channel,
    exactSemver: semver.valid(candidate) !== null && (!suffix || channel === 'prerelease'),
  };
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  const length = Math.max(left.segments.length, right.segments.length, 3);
  for (let index = 0; index < length; index += 1) {
    const difference = (left.segments[index] ?? 0) - (right.segments[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  if (left.channel !== 'prerelease' || right.channel !== 'prerelease') return 0;
  const rank = (suffix: string): [number, number] => {
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
    const number = suffix.slice(match.index ?? 0).match(/\d+/);
    return [ranks[match[1].toLowerCase()] ?? 0, number ? Number(number[0]) : 0];
  };
  const leftRank = rank(left.suffix);
  const rightRank = rank(right.suffix);
  return leftRank[0] - rightRank[0] || leftRank[1] - rightRank[1];
}

function selectLatest(releases: CachedGithubRelease[]): CachedGithubRelease | null {
  return releases.reduce<CachedGithubRelease | null>((latest, release) => {
    const parsed = parseVersion(release.tagName);
    if (!parsed) return latest;
    if (!latest) return release;
    const previous = parseVersion(latest.tagName);
    return !previous || compareVersions(parsed, previous) > 0 ? release : latest;
  }, null);
}

function breakingReasons(release: GithubRelease): string[] {
  const body = (release.body ?? '').replace(/```[\s\S]*?```/g, ' ');
  const text = `${release.name ?? ''}\n${body}`
    .replace(/\b(?:no|not\s+(?:a|an))\s+breaking[\s_-]+changes?\b/gi, ' ')
    .replace(/\bno\s+migration\s+(?:is\s+)?required\b/gi, ' ');
  return BREAKING_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ label }) => `Release notes mention: "${label}"`,
  );
}

export function normalizeReleases(raw: GithubRelease[]): CachedGithubRelease[] {
  const releases = raw.flatMap((release) => {
    const parsed = parseVersion(release.tag_name);
    if (release.draft || !parsed) return [];
    return {
      tagName: release.tag_name,
      name: release.name,
      body: release.body,
      url: release.html_url,
      publishedAt: release.published_at,
      prerelease: release.prerelease || parsed.channel === 'prerelease',
      breakingReasons: breakingReasons(release),
    } satisfies CachedGithubRelease;
  });
  const keepBodies = new Set<string>();
  for (const prerelease of [false, true]) {
    const newest = selectLatest(releases.filter((release) => release.prerelease === prerelease));
    if (newest) keepBodies.add(newest.tagName);
  }
  return releases.map((release) => ({
    ...release,
    body: keepBodies.has(release.tagName) ? release.body : null,
  }));
}

function updateKind(current: ParsedVersion, latest: ParsedVersion): UpdateKind {
  if (current.channel === 'prerelease' || latest.channel === 'prerelease') return 'prerelease';
  if ((current.segments[0] ?? 0) !== (latest.segments[0] ?? 0)) return 'major';
  if ((current.segments[1] ?? 0) !== (latest.segments[1] ?? 0)) return 'minor';
  return 'patch';
}

function breakingChanges(
  releases: CachedGithubRelease[],
  current: ParsedVersion,
  latest: ParsedVersion,
  currentLabel: string,
  latestRelease: CachedGithubRelease,
  kind: UpdateKind,
): BreakingChange[] {
  const changes: BreakingChange[] =
    kind === 'major'
      ? [
          {
            version: latestRelease.tagName,
            releaseName: latestRelease.name,
            reason: `Major version bump: ${currentLabel} → ${latestRelease.tagName}`,
            releaseUrl: latestRelease.url,
          },
        ]
      : [];
  for (const release of releases) {
    if (release.prerelease !== (current.channel === 'prerelease')) continue;
    const parsed = parseVersion(release.tagName);
    if (!parsed || compareVersions(parsed, current) <= 0 || compareVersions(parsed, latest) > 0)
      continue;
    changes.push(
      ...release.breakingReasons.map((reason) => ({
        version: release.tagName,
        releaseName: release.name,
        reason,
        releaseUrl: release.url,
      })),
    );
  }
  return changes.filter(
    (change, index, all) =>
      all.findIndex(
        (candidate) => candidate.version === change.version && candidate.reason === change.reason,
      ) === index,
  );
}

function historyComplete(
  releases: CachedGithubRelease[],
  current: ParsedVersion,
  truncated: boolean,
): boolean {
  if (!truncated) return true;
  return releases
    .filter((release) => release.prerelease === (current.channel === 'prerelease'))
    .map((release) => parseVersion(release.tagName))
    .some((version) => version !== null && compareVersions(version, current) <= 0);
}

export function enrichContainer(
  container: ContainerInfo,
  result: RepositoryReleaseResult,
): ContainerInfo {
  const current = parseVersion(container.currentVersion);
  if (!current)
    return {
      ...container,
      status: 'unknown',
      comparisonMode: 'unverifiable',
      checkIssue: createCheckIssue(
        'unverifiable-version',
        'The configured image tag cannot be compared reliably.',
      ),
      releaseDataStale: result.stale,
      lastChecked: result.checkedAt,
    };
  const releases = result.releases.filter(
    (release) => release.prerelease === (current.channel === 'prerelease'),
  );
  const latestRelease = selectLatest(releases);
  const latest = latestRelease ? parseVersion(latestRelease.tagName) : null;
  if (!latestRelease || !latest)
    return {
      ...container,
      status: 'unknown',
      comparisonMode: 'unverifiable',
      checkIssue:
        result.issue ??
        createCheckIssue('invalid-release', 'No comparable release exists for this channel.'),
      releaseDataStale: result.stale,
      lastChecked: result.checkedAt,
    };
  const comparison = compareVersions(current, latest);
  const kind = comparison < 0 ? updateKind(current, latest) : null;
  const changes =
    comparison < 0
      ? breakingChanges(releases, current, latest, container.currentVersion, latestRelease, kind)
      : [];
  let status: ContainerStatus = 'update-available';
  if (comparison > 0) status = 'ahead';
  else if (comparison === 0) status = 'up-to-date';
  else if (changes.length) status = 'breaking-change';
  const comparisonMode: ComparisonMode =
    current.exactSemver && latest.exactSemver ? 'exact' : 'normalized';
  return {
    ...container,
    latestUpstreamVersion: latestRelease.tagName,
    publishedAt: latestRelease.publishedAt,
    status,
    updateKind: kind,
    comparisonMode,
    historyComplete: historyComplete(releases, current, result.historyMayBeTruncated),
    releaseDataStale: result.stale,
    checkIssue: result.issue,
    breakingChanges: changes,
    releaseUrl: latestRelease.url,
    releaseNotes: latestRelease.body,
    releaseName: latestRelease.name,
    lastChecked: result.checkedAt,
  };
}
