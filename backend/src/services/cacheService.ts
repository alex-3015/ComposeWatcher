import fs from 'fs';
import path from 'path';
import type { ContainerInfo } from '../types.js';
import { consoleServiceLogger, type ServiceLogger } from './serviceLogger.js';

const DATA_DIR = process.env.DATA_DIR ?? '/data';
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');

let dataDirEnsured = false;

function ensureDataDir() {
  if (dataDirEnsured) return;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  dataDirEnsured = true;
}

/** Reset the ensureDataDir cache — useful for testing. */
export function resetCacheDirFlag(): void {
  dataDirEnsured = false;
}

export interface CachedData {
  schemaVersion: 2;
  containers: ContainerInfo[];
  ts: number;
}

function isValidCachedData(value: unknown): value is CachedData {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.schemaVersion === 2 &&
    Array.isArray(obj.containers) &&
    obj.containers.every(isValidContainer) &&
    typeof obj.ts === 'number' &&
    Number.isFinite(obj.ts)
  );
}

const CONTAINER_STATUSES = new Set([
  'up-to-date',
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
    isNullableString(container.latestVersion) &&
    isNullableString(container.publishedAt) &&
    typeof container.status === 'string' &&
    CONTAINER_STATUSES.has(container.status) &&
    isValidCheckIssue(container.checkIssue) &&
    isNullableString(container.breakingChangeReason) &&
    isNullableString(container.releaseUrl) &&
    isNullableString(container.releaseNotes) &&
    isNullableString(container.releaseName) &&
    isNullableString(container.lastChecked)
  );
}

export function loadCachedContainers(
  logger: ServiceLogger = consoleServiceLogger,
): CachedData | null {
  ensureDataDir();
  if (!fs.existsSync(CACHE_FILE)) return null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
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

export function saveCachedContainers(containers: ContainerInfo[]): void {
  ensureDataDir();
  const data: CachedData = { schemaVersion: 2, containers, ts: Date.now() };
  const tmpFile = `${CACHE_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  try {
    fs.renameSync(tmpFile, CACHE_FILE);
  } catch (renameErr) {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
    throw renameErr;
  }
}
