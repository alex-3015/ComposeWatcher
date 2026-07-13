import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

import fs from 'fs';
import {
  emptyGithubCache,
  loadGithubCache,
  resetGithubCacheDirFlag,
  saveGithubCache,
  type GithubCacheData,
} from '../githubCacheService.js';

const mockFs = fs as unknown as {
  existsSync: ReturnType<typeof vi.fn>;
  mkdirSync: ReturnType<typeof vi.fn>;
  readFileSync: ReturnType<typeof vi.fn>;
  writeFileSync: ReturnType<typeof vi.fn>;
  renameSync: ReturnType<typeof vi.fn>;
  unlinkSync: ReturnType<typeof vi.fn>;
};

const DATA_DIR = '/data';
const CACHE_FILE = path.join(DATA_DIR, 'github-cache.json');

function makeCache(): GithubCacheData {
  return {
    schemaVersion: 1,
    repositories: {
      'owner/repo': {
        etag: '"abc"',
        releases: [
          {
            tagName: '1.2.0',
            name: '1.2.0',
            body: 'Notes',
            url: 'https://github.com/owner/repo/releases/tag/1.2.0',
            publishedAt: '2026-07-13T12:00:00.000Z',
            prerelease: false,
            breakingReasons: [],
          },
        ],
        checkedAt: '2026-07-13T12:00:00.000Z',
        retryAt: null,
        historyMayBeTruncated: false,
      },
    },
    rateLimit: {
      limit: 5000,
      remaining: 4999,
      resetAt: '2026-07-13T13:00:00.000Z',
      observedAt: '2026-07-13T12:00:00.000Z',
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  resetGithubCacheDirFlag();
});

describe('GitHub disk cache', () => {
  it('returns an empty cache when no file exists', () => {
    mockFs.existsSync.mockImplementation((value: string) => value === DATA_DIR);

    expect(loadGithubCache()).toEqual(emptyGithubCache());
  });

  it('loads a valid cache file', () => {
    const cache = makeCache();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(cache));

    expect(loadGithubCache()).toEqual(cache);
    expect(mockFs.readFileSync).toHaveBeenCalledWith(CACHE_FILE, 'utf-8');
  });

  it.each([
    '{bad json',
    JSON.stringify({ schemaVersion: 99, repositories: {}, rateLimit: null }),
    JSON.stringify({ schemaVersion: 1, repositories: { repo: {} }, rateLimit: null }),
  ])('ignores malformed or incompatible data', (contents) => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(contents);

    expect(loadGithubCache(logger)).toEqual(emptyGithubCache());
    expect(logger.warn).toHaveBeenCalled();
  });

  it('creates the data directory on first access', () => {
    mockFs.existsSync.mockReturnValue(false);

    loadGithubCache();

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(DATA_DIR, { recursive: true });
  });

  it('writes atomically through a temporary file', () => {
    mockFs.existsSync.mockReturnValue(true);
    const cache = makeCache();

    saveGithubCache(cache);

    const temporaryPath = mockFs.writeFileSync.mock.calls[0][0] as string;
    expect(temporaryPath).toContain(`${CACHE_FILE}.`);
    expect(JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string)).toEqual(cache);
    expect(mockFs.renameSync).toHaveBeenCalledWith(temporaryPath, CACHE_FILE);
  });

  it('cleans up the temporary file when rename fails', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.renameSync.mockImplementation(() => {
      throw new Error('rename failed');
    });

    expect(() => saveGithubCache(makeCache())).toThrow('rename failed');
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(mockFs.writeFileSync.mock.calls[0][0]);
  });
});
