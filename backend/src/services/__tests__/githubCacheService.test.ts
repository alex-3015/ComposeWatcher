import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GithubCacheData } from '../githubCacheService.js';

let dataDirectory: string;

function cache(): GithubCacheData {
  return {
    schemaVersion: 2,
    repositories: {
      'owner/repo': {
        etag: 'etag',
        checkedAt: '2026-01-01T00:00:00.000Z',
        retryAt: null,
        historyMayBeTruncated: false,
        releases: [
          {
            tagName: '1.0.0',
            name: null,
            body: null,
            url: 'https://example.test',
            publishedAt: '2026-01-01T00:00:00.000Z',
            prerelease: false,
            breakingReasons: [],
          },
        ],
      },
    },
    rateLimit: null,
  };
}

async function subject() {
  vi.resetModules();
  return import('../githubCacheService.js');
}

beforeEach(async () => {
  dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'composewatcher-github-cache-'));
  process.env.DATA_DIR = dataDirectory;
});
afterEach(async () => {
  delete process.env.DATA_DIR;
  await fs.rm(dataDirectory, { recursive: true, force: true });
});

describe('GitHub cache', () => {
  it('returns an empty v2 cache when absent', async () => {
    const { loadGithubCache, emptyGithubCache } = await subject();
    await expect(loadGithubCache()).resolves.toEqual(emptyGithubCache());
  });

  it('round-trips valid data', async () => {
    const { saveGithubCache, loadGithubCache } = await subject();
    await saveGithubCache(cache());
    await expect(loadGithubCache()).resolves.toEqual(cache());
  });

  it('invalidates the legacy schema', async () => {
    await fs.writeFile(
      path.join(dataDirectory, 'github-cache.json'),
      JSON.stringify({ ...cache(), schemaVersion: 1 }),
    );
    const { loadGithubCache, emptyGithubCache } = await subject();
    await expect(loadGithubCache({ warn: vi.fn(), error: vi.fn() })).resolves.toEqual(
      emptyGithubCache(),
    );
  });

  it('ignores malformed JSON with a diagnostic', async () => {
    await fs.writeFile(path.join(dataDirectory, 'github-cache.json'), '{bad');
    const logger = { warn: vi.fn(), error: vi.fn() };
    const { loadGithubCache, emptyGithubCache } = await subject();
    await expect(loadGithubCache(logger)).resolves.toEqual(emptyGithubCache());
    expect(logger.warn).toHaveBeenCalled();
  });
});
