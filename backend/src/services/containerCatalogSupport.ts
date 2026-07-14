import type {
  ContainerDetail,
  ContainersResponse,
  RefreshMeta,
  RepositoryResponse,
} from '@composewatcher/contracts';
import type { Config, ContainerInfo } from '../types.js';
import { loadCachedContainers, saveCachedContainers } from './cacheService.js';
import { loadConfig, setRepoMapping } from './configService.js';
import { scanDockerDir } from './dockerService.js';
import { enrichWithGithubData } from './githubService.js';
import { downloadIconsForContainers, listLocalIconFileNames } from './iconService.js';

export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
export const BACKGROUND_RETRY_MS = 30_000;

export interface RefreshTask {
  controller: AbortController;
  promise: Promise<void>;
  startedAt: string;
}

export interface ContainerCatalogApi {
  initialize(refreshOnStart?: boolean): Promise<void>;
  list(): ContainersResponse;
  detail(containerId: string): ContainerDetail;
  startGlobalRefresh(): RefreshMeta;
  updateRepository(containerId: string, repo: string | null): Promise<RepositoryResponse>;
  close(): Promise<void>;
}

export class ContainerNotFoundError extends Error {
  constructor(readonly containerId: string) {
    super(`Container not found: ${containerId}`);
    this.name = 'ContainerNotFoundError';
  }
}

export interface ContainerCatalogDependencies {
  scan: typeof scanDockerDir;
  enrich: typeof enrichWithGithubData;
  loadConfig: typeof loadConfig;
  setRepoMapping: typeof setRepoMapping;
  loadSnapshot: typeof loadCachedContainers;
  saveSnapshot: typeof saveCachedContainers;
  listIcons: typeof listLocalIconFileNames;
  downloadIcons: typeof downloadIconsForContainers;
}

export const defaultCatalogDependencies: ContainerCatalogDependencies = {
  scan: scanDockerDir,
  enrich: enrichWithGithubData,
  loadConfig,
  setRepoMapping,
  loadSnapshot: loadCachedContainers,
  saveSnapshot: saveCachedContainers,
  listIcons: listLocalIconFileNames,
  downloadIcons: downloadIconsForContainers,
};

export function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function idleRefreshMeta(
  scope: RefreshMeta['scope'] = null,
  containerId: string | null = null,
): RefreshMeta {
  return {
    state: 'idle',
    scope,
    containerId,
    startedAt: null,
    finishedAt: null,
    error: null,
  };
}

export function applyRepositoryMappings(
  containers: ContainerInfo[],
  config: Config,
): ContainerInfo[] {
  return containers.map((container) => ({
    ...container,
    githubRepo: Object.hasOwn(config.repoMappings, container.id)
      ? (config.repoMappings[container.id] ?? null)
      : container.githubRepo,
  }));
}

export function resetContainerEnrichment(
  container: ContainerInfo,
  githubRepo: string | null,
): ContainerInfo {
  return {
    ...container,
    githubRepo,
    latestUpstreamVersion: null,
    publishedAt: null,
    status: githubRepo ? 'unknown' : 'no-repo',
    updateKind: null,
    comparisonMode: 'unverifiable',
    historyComplete: null,
    releaseDataStale: false,
    checkIssue: null,
    breakingChanges: [],
    releaseUrl: null,
    releaseNotes: null,
    releaseName: null,
    lastChecked: null,
  };
}

export function mergeCatalogSnapshot(
  scanned: ContainerInfo[],
  snapshot: ContainerInfo[],
): ContainerInfo[] {
  const cachedById = new Map(snapshot.map((container) => [container.id, container]));
  return scanned.map((container) => {
    const cached = cachedById.get(container.id);
    if (
      !cached ||
      cached.image !== container.image ||
      cached.currentVersion !== container.currentVersion ||
      cached.githubRepo !== container.githubRepo
    ) {
      return container;
    }
    return { ...cached, name: container.name, composeFile: container.composeFile };
  });
}
