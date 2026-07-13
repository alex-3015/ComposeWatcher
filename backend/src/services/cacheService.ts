import path from 'path';
import type { ContainerInfo, GithubRateLimit } from '../types.js';
import { consoleServiceLogger, type ServiceLogger } from './serviceLogger.js';
import { readJson, writeJsonAtomic } from './atomicJsonStore.js';

const DATA_DIR = process.env.DATA_DIR ?? '/data';
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');

export interface CachedData {
  schemaVersion: 4;
  containers: ContainerInfo[];
  ts: number;
  refreshedAt: string | null;
  githubRateLimit: GithubRateLimit | null;
}

function isValidCachedData(value: unknown): value is CachedData {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.schemaVersion === 4 &&
    Array.isArray(obj.containers) &&
    obj.containers.every(isValidContainer) &&
    typeof obj.ts === 'number' &&
    Number.isFinite(obj.ts) &&
    isNullableString(obj.refreshedAt) &&
    isValidRateLimit(obj.githubRateLimit)
  );
}

const CONTAINER_STATUSES = new Set([
  'up-to-date',
  'ahead',
  'update-available',
  'breaking-change',
  'unknown',
  'no-repo',
]);

const CHECK_ISSUE_CODES = new Set([
  'repo-not-found',
  'rate-limited',
  'timeout',
  'network',
  'github-error',
  'invalid-release',
  'unverifiable-version',
]);

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isValidCheckIssue(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== 'object' || value === null) return false;
  const issue = value as Record<string, unknown>;
  return (
    typeof issue.code === 'string' &&
    CHECK_ISSUE_CODES.has(issue.code) &&
    typeof issue.message === 'string' &&
    isNullableString(issue.retryAt)
  );
}

function isValidRateLimit(value: unknown): value is GithubRateLimit | null {
  if (value === null) return true;
  if (typeof value !== 'object') return false;
  const rateLimit = value as Record<string, unknown>;
  return (
    typeof rateLimit.limit === 'number' &&
    Number.isFinite(rateLimit.limit) &&
    typeof rateLimit.remaining === 'number' &&
    Number.isFinite(rateLimit.remaining) &&
    typeof rateLimit.resetAt === 'string' &&
    typeof rateLimit.observedAt === 'string'
  );
}

function isValidBreakingChange(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const change = value as Record<string, unknown>;
  return (
    typeof change.version === 'string' &&
    isNullableString(change.releaseName) &&
    typeof change.reason === 'string' &&
    typeof change.releaseUrl === 'string'
  );
}

function isValidContainer(value: unknown): value is ContainerInfo {
  if (typeof value !== 'object' || value === null) return false;
  const container = value as Record<string, unknown>;
  return (
    typeof container.id === 'string' &&
    typeof container.name === 'string' &&
    typeof container.image === 'string' &&
    typeof container.currentVersion === 'string' &&
    typeof container.composeFile === 'string' &&
    isNullableString(container.githubRepo) &&
    isNullableString(container.latestUpstreamVersion) &&
    isNullableString(container.publishedAt) &&
    typeof container.status === 'string' &&
    CONTAINER_STATUSES.has(container.status) &&
    (container.updateKind === null ||
      container.updateKind === 'major' ||
      container.updateKind === 'minor' ||
      container.updateKind === 'patch' ||
      container.updateKind === 'prerelease') &&
    (container.comparisonMode === 'exact' ||
      container.comparisonMode === 'normalized' ||
      container.comparisonMode === 'unverifiable') &&
    (container.historyComplete === null || typeof container.historyComplete === 'boolean') &&
    typeof container.releaseDataStale === 'boolean' &&
    isValidCheckIssue(container.checkIssue) &&
    Array.isArray(container.breakingChanges) &&
    container.breakingChanges.every(isValidBreakingChange) &&
    isNullableString(container.releaseUrl) &&
    isNullableString(container.releaseNotes) &&
    isNullableString(container.releaseName) &&
    isNullableString(container.lastChecked)
  );
}

export async function loadCachedContainers(
  logger: ServiceLogger = consoleServiceLogger,
): Promise<CachedData | null> {
  try {
    const parsed = await readJson(CACHE_FILE);
    if (parsed === null) return null;
    if (!isValidCachedData(parsed)) {
      logger.warn({}, 'Cache file has invalid structure, ignoring');
      return null;
    }
    return parsed;
  } catch (error) {
    logger.warn({ error }, 'Failed to read cache file, ignoring');
    return null;
  }
}

export async function saveCachedContainers(
  containers: ContainerInfo[],
  githubRateLimit: GithubRateLimit | null,
  refreshedAt: string | null,
): Promise<void> {
  const data: CachedData = {
    schemaVersion: 4,
    containers,
    ts: Date.now(),
    refreshedAt,
    githubRateLimit,
  };
  await writeJsonAtomic(CACHE_FILE, data);
}
