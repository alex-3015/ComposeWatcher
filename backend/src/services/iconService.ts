import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'path';
import type { ContainerInfo } from '../types.js';

const DATA_DIR = process.env.DATA_DIR ?? '/data';
const ICONS_DIR = path.join(DATA_DIR, 'icons');

const ICON_CDN_BASE = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/png';
const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_024 * 1_024; // 1 MB
const BATCH_SIZE = 5;
const MAX_NAME_LENGTH = 128;
const inFlightDownloads = new Map<string, Promise<boolean>>();

/** Maps service names to selfh.st icon references for server-owned icon URLs. */
const ICON_NAME_MAP: Record<string, string> = {
  adguardhome: 'adguard-home',
  'portainer-ce': 'portainer',
  'portainer-ee': 'portainer',
};

async function ensureIconsDir(): Promise<void> {
  await fs.mkdir(ICONS_DIR, { recursive: true });
}

/** Loads the locally available PNG filenames once for in-memory API projection. */
export async function listLocalIconFileNames(): Promise<Set<string>> {
  try {
    await ensureIconsDir();
    const entries = await fs.readdir(ICONS_DIR, { withFileTypes: true });
    return new Set(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
        .map((entry) => entry.name),
    );
  } catch {
    return new Set();
  }
}

/**
 * Derive the icon filename for a service name.
 * Applies name mapping and sanitization.
 * Returns the filename (e.g. "sonarr.png") or null if the name is invalid.
 */
export function getIconFileName(serviceName: string): string | null {
  const trimmed = serviceName.toLowerCase().trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_NAME_LENGTH) return null;

  // Reject names containing path traversal or separator characters
  if (/[/\\]/.test(trimmed) || trimmed.includes('..')) return null;

  const reference = ICON_NAME_MAP[trimmed] ?? trimmed;
  return `${reference}.png`;
}

/**
 * Check whether an icon file already exists locally.
 */
export async function iconExistsLocally(serviceName: string): Promise<boolean> {
  const fileName = getIconFileName(serviceName);
  if (!fileName) return false;

  await ensureIconsDir();
  const fullPath = path.resolve(ICONS_DIR, fileName);

  // Path traversal guard
  if (!fullPath.startsWith(path.resolve(ICONS_DIR))) return false;

  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download a single icon from the CDN and save it locally.
 * Returns true on success, false on any failure. Never throws.
 */
async function downloadIconFile(fileName: string): Promise<boolean> {
  const finalPath = path.resolve(ICONS_DIR, fileName);

  // Path traversal guard
  if (!finalPath.startsWith(path.resolve(ICONS_DIR))) return false;

  const reference = fileName.replace(/\.png$/, '');
  const url = `${ICON_CDN_BASE}/${reference}.png`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  let tmpFile: string | null = null;
  try {
    await ensureIconsDir();
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return false;

    // Validate content type
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return false;

    // Validate content length if provided
    const contentLength = Number(res.headers.get('content-length') ?? '0');
    if (contentLength > MAX_RESPONSE_BYTES) return false;

    const buf = Buffer.from(await res.arrayBuffer());

    // Reject oversized responses (content-length may be missing or wrong)
    if (buf.byteLength > MAX_RESPONSE_BYTES) return false;

    tmpFile = `${finalPath}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(tmpFile, buf);
    await fs.rename(tmpFile, finalPath);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
    if (tmpFile) {
      try {
        await fs.rm(tmpFile, { force: true });
      } catch {
        // file was already renamed or never created
      }
    }
  }
}

export function downloadIcon(serviceName: string): Promise<boolean> {
  const fileName = getIconFileName(serviceName);
  if (!fileName) return Promise.resolve(false);

  const inFlight = inFlightDownloads.get(fileName);
  if (inFlight) return inFlight;

  const download = downloadIconFile(fileName).finally(() => {
    if (inFlightDownloads.get(fileName) === download) inFlightDownloads.delete(fileName);
  });
  inFlightDownloads.set(fileName, download);
  return download;
}

/**
 * Download icons for all containers that are not yet cached locally.
 * Processes in parallel batches and returns every available filename.
 */
export async function downloadIconsForContainers(
  containers: ContainerInfo[],
): Promise<Set<string>> {
  const candidates = new Map<string, string>();
  const available = new Set<string>();

  for (const c of containers) {
    const fileName = getIconFileName(c.name);
    if (fileName && !candidates.has(fileName)) candidates.set(fileName, c.name);
  }

  const entries = [...candidates.entries()];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async ([fileName, serviceName]) => {
        try {
          const exists = await iconExistsLocally(serviceName);
          return exists || (await downloadIcon(serviceName)) ? fileName : null;
        } catch {
          // A local filesystem failure for one candidate must not discard the
          // successfully resolved icons from the rest of the batch.
          return null;
        }
      }),
    );
    for (const fileName of results) {
      if (fileName) available.add(fileName);
    }
  }

  return available;
}
