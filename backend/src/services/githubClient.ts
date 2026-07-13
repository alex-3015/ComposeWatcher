import type { CheckIssue, GithubRateLimit, GithubRelease } from '../types.js';
import {
  createCheckIssue,
  normalizeReleases,
  type RepositoryReleaseResult,
} from '../domain/versionComparison.js';
import type { GithubCacheData, GithubRepositoryCacheEntry } from './githubCacheService.js';

const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 20;
const RELEASE_LIMIT = 100;
const REPOSITORY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function concurrency(): number {
  const configured = Number(process.env.GITHUB_CONCURRENCY);
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, MAX_CONCURRENCY)
    : DEFAULT_CONCURRENCY;
}

function headers(etag: string | null): Record<string, string> {
  const result: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ComposeWatcher/3.0',
  };
  if (process.env.GITHUB_TOKEN) result.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  if (etag) result['If-None-Match'] = etag;
  return result;
}

function isRelease(value: unknown): value is GithubRelease {
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

function rateLimit(responseHeaders: Headers): GithubRateLimit | null {
  const limitHeader = responseHeaders.get('x-ratelimit-limit');
  const remainingHeader = responseHeaders.get('x-ratelimit-remaining');
  const resetHeader = responseHeaders.get('x-ratelimit-reset');
  if (limitHeader === null || remainingHeader === null || resetHeader === null) return null;
  const limit = Number(limitHeader);
  const remaining = Number(remainingHeader);
  const reset = Number(resetHeader);
  if (![limit, remaining, reset].every(Number.isFinite) || limit < 0 || remaining < 0 || reset < 0)
    return null;
  const resetAt = new Date(reset * 1000);
  if (Number.isNaN(resetAt.getTime())) return null;
  return { limit, remaining, resetAt: resetAt.toISOString(), observedAt: new Date().toISOString() };
}

function retryAt(responseHeaders: Headers): string {
  const retryAfterHeader = responseHeaders.get('retry-after');
  const retryAfter = Number(retryAfterHeader);
  if (retryAfterHeader !== null && Number.isFinite(retryAfter) && retryAfter >= 0) {
    return new Date(Date.now() + retryAfter * 1000).toISOString();
  }
  const resetHeader = responseHeaders.get('x-ratelimit-reset');
  const reset = Number(resetHeader);
  if (resetHeader !== null && Number.isFinite(reset) && reset > 0) {
    return new Date(reset * 1000).toISOString();
  }
  return new Date(Date.now() + 60_000).toISOString();
}

function statusIssue(status: number, responseHeaders: Headers): CheckIssue {
  if (status === 404)
    return createCheckIssue('repo-not-found', 'Repository or releases not found.');
  if (status === 403 || status === 429)
    return createCheckIssue(
      'rate-limited',
      'GitHub API rate limit reached.',
      retryAt(responseHeaders),
    );
  return createCheckIssue('github-error', `GitHub API returned HTTP ${status}.`);
}

function failure(
  entry: GithubRepositoryCacheEntry | undefined,
  issue: CheckIssue,
): RepositoryReleaseResult {
  return {
    releases: entry?.releases ?? [],
    issue,
    stale: Boolean(entry?.releases.length),
    checkedAt: entry?.checkedAt ?? null,
    historyMayBeTruncated: entry?.historyMayBeTruncated ?? false,
  };
}

async function fetchRepository(
  repository: string,
  cache: GithubCacheData,
  externalSignal?: AbortSignal,
): Promise<RepositoryReleaseResult> {
  const entry = cache.repositories[repository];
  if (!REPOSITORY_PATTERN.test(repository))
    return failure(entry, createCheckIssue('github-error', 'Invalid GitHub repository mapping.'));
  if (entry?.retryAt && new Date(entry.retryAt).getTime() > Date.now()) {
    return failure(
      entry,
      createCheckIssue('rate-limited', 'GitHub API rate limit reached.', entry.retryAt),
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/releases?per_page=${RELEASE_LIMIT}`,
      {
        headers: headers(entry?.etag ?? null),
        signal: externalSignal
          ? AbortSignal.any([controller.signal, externalSignal])
          : controller.signal,
      },
    );
    const observed = rateLimit(response.headers);
    if (
      observed &&
      (!cache.rateLimit ||
        observed.resetAt > cache.rateLimit.resetAt ||
        (observed.resetAt === cache.rateLimit.resetAt &&
          observed.remaining < cache.rateLimit.remaining))
    ) {
      cache.rateLimit = observed;
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
      const issue = statusIssue(response.status, response.headers);
      if (issue.code === 'rate-limited')
        cache.repositories[repository] = {
          etag: entry?.etag ?? null,
          releases: entry?.releases ?? [],
          checkedAt: entry?.checkedAt ?? null,
          retryAt: issue.retryAt,
          historyMayBeTruncated: entry?.historyMayBeTruncated ?? false,
        };
      return failure(cache.repositories[repository] ?? entry, issue);
    }
    const parsed: unknown = await response.json();
    if (!Array.isArray(parsed))
      return failure(
        entry,
        createCheckIssue('invalid-release', 'GitHub returned an invalid releases response.'),
      );
    const releases = normalizeReleases(parsed.filter(isRelease));
    if (!releases.length)
      return failure(
        entry,
        createCheckIssue('invalid-release', 'GitHub returned no comparable published releases.'),
      );
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
    if (externalSignal?.aborted) throw error;
    if (error instanceof Error && error.name === 'AbortError')
      return failure(entry, createCheckIssue('timeout', 'GitHub request timed out.'));
    if (error instanceof TypeError)
      return failure(entry, createCheckIssue('network', 'GitHub could not be reached.'));
    return failure(entry, createCheckIssue('github-error', 'GitHub request failed unexpectedly.'));
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchRepositories(
  repositories: string[],
  cache: GithubCacheData,
  signal?: AbortSignal,
): Promise<Map<string, RepositoryReleaseResult>> {
  const results = new Map<string, RepositoryReleaseResult>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency(), repositories.length) }, async () => {
      while (next < repositories.length) {
        const repository = repositories[next++];
        results.set(repository, await fetchRepository(repository, cache, signal));
      }
    }),
  );
  return results;
}
