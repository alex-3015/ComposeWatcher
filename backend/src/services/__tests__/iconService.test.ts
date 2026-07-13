import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContainerInfo } from '../../types.js';

let dataDirectory: string;

async function subject() {
  vi.resetModules();
  return import('../iconService.js');
}

function response(body = new Uint8Array([1, 2, 3]), contentType = 'image/png'): Response {
  return new Response(body, { status: 200, headers: { 'content-type': contentType } });
}

function container(name: string): ContainerInfo {
  return {
    id: `compose.yml::${name}`,
    name,
    image: `owner/${name}`,
    currentVersion: '1.0.0',
    composeFile: 'compose.yml',
    githubRepo: `owner/${name}`,
    latestUpstreamVersion: null,
    publishedAt: null,
    status: 'unknown',
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

beforeEach(async () => {
  dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'composewatcher-icons-'));
  process.env.DATA_DIR = dataDirectory;
});
afterEach(async () => {
  delete process.env.DATA_DIR;
  vi.unstubAllGlobals();
  await fs.rm(dataDirectory, { recursive: true, force: true });
});

describe('icon service', () => {
  it.each([
    ['sonarr', 'sonarr.png'],
    ['AdGuardHome', 'adguard-home.png'],
    ['portainer-ce', 'portainer.png'],
  ])('maps %s to %s', async (name, expected) => {
    const { getIconFileName } = await subject();
    expect(getIconFileName(name)).toBe(expected);
  });

  it.each(['', '   ', '../secret', 'a/b', 'a\\b'])('rejects unsafe name %j', async (name) => {
    const { getIconFileName } = await subject();
    expect(getIconFileName(name)).toBeNull();
  });

  it('detects a locally cached icon', async () => {
    await fs.mkdir(path.join(dataDirectory, 'icons'));
    await fs.writeFile(path.join(dataDirectory, 'icons', 'sonarr.png'), 'png');
    const { iconExistsLocally } = await subject();
    await expect(iconExistsLocally('sonarr')).resolves.toBe(true);
    await expect(iconExistsLocally('radarr')).resolves.toBe(false);
  });

  it('downloads an image atomically', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
    const { downloadIcon } = await subject();
    await expect(downloadIcon('sonarr')).resolves.toBe(true);
    await expect(fs.readFile(path.join(dataDirectory, 'icons', 'sonarr.png'))).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
  });

  it('rejects non-images and oversized payloads', async () => {
    const { downloadIcon } = await subject();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(new Uint8Array([1]), 'text/plain')));
    await expect(downloadIcon('sonarr')).resolves.toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(new Uint8Array(1_024 * 1_024 + 1))));
    await expect(downloadIcon('sonarr')).resolves.toBe(false);
  });

  it('deduplicates batch downloads by icon filename', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);
    const { downloadIconsForContainers } = await subject();
    await downloadIconsForContainers([container('portainer-ce'), container('portainer-ee')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
