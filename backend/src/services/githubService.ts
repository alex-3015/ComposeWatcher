import type { ContainerInfo, GithubRateLimit } from '../types.js';
import { createCheckIssue, enrichContainer } from '../domain/versionComparison.js';
import { loadGithubCache, saveGithubCache } from './githubCacheService.js';
import { fetchRepositories } from './githubClient.js';
import { consoleServiceLogger, type ServiceLogger } from './serviceLogger.js';

export interface EnrichmentResult {
  containers: ContainerInfo[];
  githubRateLimit: GithubRateLimit | null;
}

/** Enriches containers with one bounded, cached GitHub request per unique repository. */
export async function enrichWithGithubData(
  containers: ContainerInfo[],
  logger: ServiceLogger = consoleServiceLogger,
  signal?: AbortSignal,
  pruneCache = false,
): Promise<EnrichmentResult> {
  const repositories = [
    ...new Set(
      containers.flatMap((container) => (container.githubRepo ? [container.githubRepo] : [])),
    ),
  ];
  const cache = await loadGithubCache(logger);
  const results = await fetchRepositories(repositories, cache, signal);
  if (pruneCache) {
    const active = new Set(repositories);
    cache.repositories = Object.fromEntries(
      Object.entries(cache.repositories).filter(([repository]) => active.has(repository)),
    );
  }
  if (repositories.length || pruneCache) {
    try {
      await saveGithubCache(cache);
    } catch (error) {
      logger.warn({ error }, 'Failed to persist GitHub cache');
    }
  }
  return {
    githubRateLimit: cache.rateLimit,
    containers: containers.map((container) => {
      if (!container.githubRepo)
        return {
          ...container,
          status: 'no-repo',
          comparisonMode: 'unverifiable',
          checkIssue: null,
        };
      const result = results.get(container.githubRepo);
      if (!result)
        return {
          ...container,
          status: 'unknown',
          comparisonMode: 'unverifiable',
          checkIssue: createCheckIssue('github-error', 'GitHub check did not complete.'),
        };
      if (result.issue)
        logger.warn(
          { repository: container.githubRepo, code: result.issue.code },
          'GitHub check failed',
        );
      if (!result.releases.length)
        return {
          ...container,
          status: 'unknown',
          comparisonMode: 'unverifiable',
          releaseDataStale: result.stale,
          checkIssue: result.issue,
          lastChecked: result.checkedAt,
        };
      return enrichContainer(container, result);
    }),
  };
}
