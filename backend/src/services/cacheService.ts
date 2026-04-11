import fs from 'fs';
import path from 'path';
import type { ContainerInfo } from '../types.js';

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
  containers: ContainerInfo[];
  ts: number;
}

function isValidCachedData(value: unknown): value is CachedData {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return Array.isArray(obj.containers) && typeof obj.ts === 'number' && Number.isFinite(obj.ts);
}

export function loadCachedContainers(): CachedData | null {
  ensureDataDir();
  if (!fs.existsSync(CACHE_FILE)) return null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    if (!isValidCachedData(parsed)) {
      console.warn('Cache file has invalid structure, ignoring');
      return null;
    }
    return parsed;
  } catch {
    console.warn('Failed to read cache file, ignoring');
    return null;
  }
}

export function saveCachedContainers(containers: ContainerInfo[]): void {
  ensureDataDir();
  const data: CachedData = { containers, ts: Date.now() };
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
