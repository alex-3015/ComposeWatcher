import semver from 'semver';
import type { CheckIssue, ContainerInfo, ContainerStatus, GithubRelease } from '../types.js';

const BREAKING_KEYWORDS = [
  'breaking change',
  'breaking-change',
  'breaking_change',
  'incompatible',
  'migration required',
  'manual intervention',
  'nicht abwärtskompatibel',
];

const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 20;
const REPO_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

interface Logger {
  warn(message: string): void;
}

type ReleaseResult = { release: GithubRelease; issue: null } | { release: null; issue: CheckIssue };

function getConcurrency(): number {
  const configured = Number(process.env.GITHUB_CONCURRENCY);
  if (!Number.isInteger(configured) || configured < 1) return DEFAULT_CONCURRENCY;
  return Math.min(configured, MAX_CONCURRENCY);
}

function getGithubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ComposeWatcher/2.0',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
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

function getRetryAt(headers: Headers | undefined): string | null {
  if (!headers) return null;
  const retryAfterHeader = headers.get('retry-after');
  if (retryAfterHeader !== null) {
    const retryAfter = Number(retryAfterHeader);
    if (Number.isFinite(retryAfter) && retryAfter >= 0) {
      return new Date(Date.now() + retryAfter * 1000).toISOString();
    }
  }
  const resetHeader = headers.get('x-ratelimit-reset');
  if (resetHeader === null) return null;
  const reset = Number(resetHeader);
  return Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null;
}

function issue(
  code: CheckIssue['code'],
  message: string,
  retryAt: string | null = null,
): CheckIssue {
  return { code, message, retryAt };
}

async function fetchLatestRelease(repoPath: string): Promise<ReleaseResult> {
  if (!REPO_REGEX.test(repoPath)) {
    return { release: null, issue: issue('github-error', 'Invalid GitHub repository mapping.') };
  }

  const url = `https://api.github.com/repos/${repoPath}/releases/latest`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: getGithubHeaders(),
      signal: controller.signal,
    });

    if (response.status === 404) {
      return {
        release: null,
        issue: issue('repo-not-found', 'Repository or latest release not found.'),
      };
    }
    if (response.status === 403 || response.status === 429) {
      return {
        release: null,
        issue: issue(
          'rate-limited',
          'GitHub API rate limit reached.',
          getRetryAt(response.headers),
        ),
      };
    }
    if (!response.ok) {
      return {
        release: null,
        issue: issue('github-error', `GitHub API returned HTTP ${response.status}.`),
      };
    }

    const parsed: unknown = await response.json();
    if (!isGithubRelease(parsed)) {
      return {
        release: null,
        issue: issue('invalid-release', 'GitHub returned an invalid release response.'),
      };
    }
    return { release: parsed, issue: null };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { release: null, issue: issue('timeout', 'GitHub request timed out.') };
    }
    if (error instanceof TypeError) {
      return { release: null, issue: issue('network', 'GitHub could not be reached.') };
    }
    return {
      release: null,
      issue: issue('github-error', 'GitHub request failed unexpectedly.'),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/, '');
}

function isUnverifiableVersion(version: string): boolean {
  const normalized = version.trim().toLowerCase();
  return (
    normalized === 'latest' ||
    normalized.startsWith('sha256:') ||
    normalized.includes('${') ||
    normalized.length === 0
  );
}

function compareVersions(
  currentVersion: string,
  latestVersion: string,
): { status: ContainerStatus; issue: CheckIssue | null } {
  if (isUnverifiableVersion(currentVersion) || isUnverifiableVersion(latestVersion)) {
    return {
      status: 'unknown',
      issue: issue('unverifiable-version', 'The configured image tag cannot be compared reliably.'),
    };
  }

  const currentNormalized = normalizeVersion(currentVersion);
  const latestNormalized = normalizeVersion(latestVersion);
  const current = semver.parse(currentNormalized);
  const latest = semver.parse(latestNormalized);

  if (current && latest) {
    return { status: semver.lt(current, latest) ? 'update-available' : 'up-to-date', issue: null };
  }
  if (currentNormalized === latestNormalized) {
    return { status: 'up-to-date', issue: null };
  }
  return {
    status: 'unknown',
    issue: issue('unverifiable-version', 'The image and release tags are not comparable versions.'),
  };
}

function detectBreakingChange(
  release: GithubRelease,
  currentVersion: string,
  latestVersion: string,
): string | null {
  const current = semver.parse(normalizeVersion(currentVersion));
  const latest = semver.parse(normalizeVersion(latestVersion));
  if (current && latest && latest.major > current.major) {
    return `Major version bump: ${currentVersion} → ${latestVersion}`;
  }

  const body = (release.body ?? '').toLowerCase();
  const title = (release.name ?? '').toLowerCase();
  for (const keyword of BREAKING_KEYWORDS) {
    if (body.includes(keyword) || title.includes(keyword)) {
      return `Release notes mention: "${keyword}"`;
    }
  }
  return null;
}

async function fetchUniqueRepositories(
  repositories: string[],
): Promise<Map<string, ReleaseResult>> {
  const results = new Map<string, ReleaseResult>();
  let nextIndex = 0;
  const workerCount = Math.min(getConcurrency(), repositories.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < repositories.length) {
        const repository = repositories[nextIndex++];
        results.set(repository, await fetchLatestRelease(repository));
      }
    }),
  );
  return results;
}

/** Enriches containers with one bounded, deduplicated GitHub request per repository. */
export async function enrichWithGithubData(
  containers: ContainerInfo[],
  logger: Logger = console,
): Promise<ContainerInfo[]> {
  const repositories = [
    ...new Set(
      containers.flatMap((container) => (container.githubRepo ? [container.githubRepo] : [])),
    ),
  ];
  const releaseResults = await fetchUniqueRepositories(repositories);
  const checkedAt = new Date().toISOString();

  return containers.map((container) => {
    if (!container.githubRepo) {
      return { ...container, status: 'no-repo', checkIssue: null };
    }

    const result = releaseResults.get(container.githubRepo);
    if (!result || result.issue) {
      const checkIssue = result?.issue ?? issue('github-error', 'GitHub check did not complete.');
      logger.warn(`GitHub check failed for ${container.githubRepo}: ${checkIssue.code}`);
      return { ...container, status: 'unknown', checkIssue, lastChecked: checkedAt };
    }

    const release = result.release;
    const comparison = compareVersions(container.currentVersion, release.tag_name);
    const breakingChangeReason =
      comparison.status === 'update-available'
        ? detectBreakingChange(release, container.currentVersion, release.tag_name)
        : null;

    return {
      ...container,
      latestVersion: release.tag_name,
      publishedAt: release.published_at,
      status: breakingChangeReason ? 'breaking-change' : comparison.status,
      checkIssue: comparison.issue,
      breakingChangeReason,
      releaseUrl: release.html_url,
      releaseNotes: release.body,
      releaseName: release.name,
      lastChecked: checkedAt,
    };
  });
}
