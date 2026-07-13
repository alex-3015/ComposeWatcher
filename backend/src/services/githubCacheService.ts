import fs from 'fs';
import path from 'path';
import type { GithubRateLimit } from '../types.js';
import { consoleServiceLogger, type ServiceLogger } from './serviceLogger.js';

const DATA_DIR = process.env.DATA_DIR ?? '/data';
const CACHE_FILE = path.join(DATA_DIR, 'github-cache.json');
const SCHEMA_VERSION = 1;

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
  schemaVersion: 1;
  repositories: Record<string, GithubRepositoryCacheEntry>;
  rateLimit: GithubRateLimit | null;
}

let dataDirEnsured = false;

function ensureDataDir(): void {
  if (dataDirEnsured) return;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  dataDirEnsured = true;
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

export function loadGithubCache(logger: ServiceLogger = consoleServiceLogger): GithubCacheData {
  ensureDataDir();
  if (!fs.existsSync(CACHE_FILE)) return emptyGithubCache();
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
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

export function saveGithubCache(cache: GithubCacheData): void {
  ensureDataDir();
  const tmpFile = `${CACHE_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(cache, null, 2));
  try {
    fs.renameSync(tmpFile, CACHE_FILE);
  } catch (error) {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Best-effort cleanup only.
    }
    throw error;
  }
}

export function resetGithubCacheDirFlag(): void {
  dataDirEnsured = false;
}
