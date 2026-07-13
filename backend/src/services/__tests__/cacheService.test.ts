import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContainerInfo } from '../../types.js';

let dataDirectory: string;

function container(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'compose.yml::app',
    name: 'app',
    image: 'owner/app',
    currentVersion: '1.0.0',
    composeFile: 'compose.yml',
    githubRepo: 'owner/app',
    latestUpstreamVersion: '1.0.0',
    publishedAt: '2026-01-01T00:00:00.000Z',
    status: 'up-to-date',
    updateKind: null,
    comparisonMode: 'exact',
    historyComplete: true,
    releaseDataStale: false,
    checkIssue: null,
    breakingChanges: [],
    releaseUrl: null,
    releaseNotes: null,
    releaseName: null,
    lastChecked: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function subject() {
  vi.resetModules();
  return import('../cacheService.js');
}

beforeEach(async () => {
  dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'composewatcher-cache-'));
  process.env.DATA_DIR = dataDirectory;
});
afterEach(async () => {
  delete process.env.DATA_DIR;
  await fs.rm(dataDirectory, { recursive: true, force: true });
});

describe('container snapshot cache', () => {
  it('returns null when absent', async () => {
    const { loadCachedContainers } = await subject();
    await expect(loadCachedContainers()).resolves.toBeNull();
  });

  it('round-trips a version-4 snapshot', async () => {
    const { saveCachedContainers, loadCachedContainers } = await subject();
    await saveCachedContainers([container()], null, '2026-01-01T00:00:00.000Z');
    const result = await loadCachedContainers();
    expect(result?.schemaVersion).toBe(4);
    expect(result?.containers).toEqual([container()]);
    expect(result?.refreshedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('invalidates v2/v3 snapshots', async () => {
    await fs.writeFile(
      path.join(dataDirectory, 'cache.json'),
      JSON.stringify({
        schemaVersion: 3,
        containers: [container()],
        ts: Date.now(),
        githubRateLimit: null,
      }),
    );
    const { loadCachedContainers } = await subject();
    await expect(loadCachedContainers({ warn: vi.fn(), error: vi.fn() })).resolves.toBeNull();
  });

  it('rejects structurally incomplete containers', async () => {
    await fs.writeFile(
      path.join(dataDirectory, 'cache.json'),
      JSON.stringify({
        schemaVersion: 4,
        containers: [{ id: 'bad' }],
        ts: Date.now(),
        refreshedAt: null,
        githubRateLimit: null,
      }),
    );
    const { loadCachedContainers } = await subject();
    await expect(loadCachedContainers({ warn: vi.fn(), error: vi.fn() })).resolves.toBeNull();
  });

  it('rejects malformed rate-limit metadata', async () => {
    await fs.writeFile(
      path.join(dataDirectory, 'cache.json'),
      JSON.stringify({
        schemaVersion: 4,
        containers: [container()],
        ts: Date.now(),
        refreshedAt: null,
        githubRateLimit: {},
      }),
    );
    const { loadCachedContainers } = await subject();
    await expect(loadCachedContainers({ warn: vi.fn(), error: vi.fn() })).resolves.toBeNull();
  });

  it('accepts complete diagnostics, breaking changes, and rate-limit metadata', async () => {
    const cached = container({
      checkIssue: {
        code: 'rate-limited',
        message: 'Try later.',
        retryAt: '2026-01-01T01:00:00.000Z',
      },
      breakingChanges: [
        {
          version: '2.0.0',
          releaseName: null,
          reason: 'Major version bump',
          releaseUrl: 'https://example.test/v2',
        },
      ],
    });
    const rateLimit = {
      limit: 60,
      remaining: 5,
      resetAt: '2026-01-01T01:00:00.000Z',
      observedAt: '2026-01-01T00:00:00.000Z',
    };
    await fs.writeFile(
      path.join(dataDirectory, 'cache.json'),
      JSON.stringify({
        schemaVersion: 4,
        containers: [cached],
        ts: Date.now(),
        refreshedAt: '2026-01-01T00:00:00.000Z',
        githubRateLimit: rateLimit,
      }),
    );
    const { loadCachedContainers } = await subject();
    await expect(loadCachedContainers()).resolves.toMatchObject({
      containers: [cached],
      githubRateLimit: rateLimit,
    });
  });

  it.each([
    ['id', null],
    ['name', null],
    ['image', null],
    ['currentVersion', null],
    ['composeFile', null],
    ['githubRepo', 1],
    ['latestUpstreamVersion', 1],
    ['publishedAt', 1],
    ['status', 'invalid'],
    ['updateKind', 'invalid'],
    ['comparisonMode', 'invalid'],
    ['historyComplete', 'invalid'],
    ['releaseDataStale', null],
    ['checkIssue', { code: 'invalid', message: 'bad', retryAt: null }],
    ['breakingChanges', [{}]],
    ['releaseUrl', 1],
    ['releaseNotes', 1],
    ['releaseName', 1],
    ['lastChecked', 1],
  ])('rejects a container with invalid %s', async (field, value) => {
    const invalid = { ...container(), [field]: value };
    await fs.writeFile(
      path.join(dataDirectory, 'cache.json'),
      JSON.stringify({
        schemaVersion: 4,
        containers: [invalid],
        ts: Date.now(),
        refreshedAt: null,
        githubRateLimit: null,
      }),
    );
    const { loadCachedContainers } = await subject();
    await expect(loadCachedContainers({ warn: vi.fn(), error: vi.fn() })).resolves.toBeNull();
  });
});
