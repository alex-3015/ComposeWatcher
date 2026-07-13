import path from 'path';
import type { GithubRateLimit } from '../types.js';
import { consoleServiceLogger, type ServiceLogger } from './serviceLogger.js';
import { readJson, writeJsonAtomic } from './atomicJsonStore.js';

const DATA_DIR = process.env.DATA_DIR ?? '/data';
const CACHE_FILE = path.join(DATA_DIR, 'github-cache.json');
const SCHEMA_VERSION = 2;

export interface CachedGithubRelease {
  tagName: string;
  name: string | null;
  body: string | null;
  url: string;
  publishedAt: string;
  prerelease: boolean;
  breakingReasons: string[];
}

export interface GithubRepositoryCacheEntry {
  etag: string | null;
  releases: CachedGithubRelease[];
  checkedAt: string | null;
  retryAt: string | null;
  historyMayBeTruncated: boolean;
}

export interface GithubCacheData {
  schemaVersion: 2;
  repositories: Record<string, GithubRepositoryCacheEntry>;
  rateLimit: GithubRateLimit | null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isRateLimit(value: unknown): value is GithubRateLimit {
  if (typeof value !== 'object' || value === null) return false;
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

function isRelease(value: unknown): value is CachedGithubRelease {
  if (typeof value !== 'object' || value === null) return false;
  const release = value as Record<string, unknown>;
  return (
    typeof release.tagName === 'string' &&
    isNullableString(release.name) &&
    isNullableString(release.body) &&
    typeof release.url === 'string' &&
    typeof release.publishedAt === 'string' &&
    typeof release.prerelease === 'boolean' &&
    Array.isArray(release.breakingReasons) &&
    release.breakingReasons.every((reason) => typeof reason === 'string')
  );
}

function isEntry(value: unknown): value is GithubRepositoryCacheEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    isNullableString(entry.etag) &&
    Array.isArray(entry.releases) &&
    entry.releases.every(isRelease) &&
    isNullableString(entry.checkedAt) &&
    isNullableString(entry.retryAt) &&
    typeof entry.historyMayBeTruncated === 'boolean'
  );
}

function isCacheData(value: unknown): value is GithubCacheData {
  if (typeof value !== 'object' || value === null) return false;
  const cache = value as Record<string, unknown>;
  if (
    cache.schemaVersion !== SCHEMA_VERSION ||
    typeof cache.repositories !== 'object' ||
    cache.repositories === null ||
    Array.isArray(cache.repositories) ||
    !(cache.rateLimit === null || isRateLimit(cache.rateLimit))
  ) {
    return false;
  }
  return Object.values(cache.repositories).every(isEntry);
}

export function emptyGithubCache(): GithubCacheData {
  return { schemaVersion: SCHEMA_VERSION, repositories: {}, rateLimit: null };
}

export async function loadGithubCache(
  logger: ServiceLogger = consoleServiceLogger,
): Promise<GithubCacheData> {
  try {
    const parsed = await readJson(CACHE_FILE);
    if (parsed === null) return emptyGithubCache();
    if (!isCacheData(parsed)) {
      logger.warn({}, 'GitHub cache file has invalid structure, ignoring');
      return emptyGithubCache();
    }
    return parsed;
  } catch (error) {
    logger.warn({ error }, 'Failed to read GitHub cache file, ignoring');
    return emptyGithubCache();
  }
}

export async function saveGithubCache(cache: GithubCacheData): Promise<void> {
  await writeJsonAtomic(CACHE_FILE, cache);
}
