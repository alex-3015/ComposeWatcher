import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// ── fs mock ────────────────────────────────────────────────────────────────
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

import fsDefault from 'fs';
import { loadCachedContainers, saveCachedContainers, resetCacheDirFlag } from '../cacheService.js';
import type { ContainerInfo } from '../../types.js';

const mockFs = fsDefault as unknown as {
  existsSync: ReturnType<typeof vi.fn>;
  mkdirSync: ReturnType<typeof vi.fn>;
  readFileSync: ReturnType<typeof vi.fn>;
  writeFileSync: ReturnType<typeof vi.fn>;
  renameSync: ReturnType<typeof vi.fn>;
  unlinkSync: ReturnType<typeof vi.fn>;
};

const DATA_DIR = '/data';
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');
const TMP_FILE_PATTERN = new RegExp(
  `^${CACHE_FILE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+\\.\\d+\\.[a-z0-9]+\\.tmp$`,
);

function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'docker-compose.yml::sonarr',
    name: 'sonarr',
    image: 'ghcr.io/linuxserver/sonarr',
    currentVersion: '4.0.0',
    composeFile: 'docker-compose.yml',
    githubRepo: 'linuxserver/sonarr',
    latestVersion: '4.0.0',
    publishedAt: '2024-01-01T00:00:00Z',
    status: 'up-to-date',
    breakingChangeReason: null,
    releaseUrl: 'https://github.com/linuxserver/sonarr/releases/tag/4.0.0',
    releaseNotes: null,
    releaseName: null,
    lastChecked: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  resetCacheDirFlag();
});

// ────────────────────────────────────────────────────────────────────────────
// loadCachedContainers
// ────────────────────────────────────────────────────────────────────────────
describe('loadCachedContainers', () => {
  it('returns parsed data when cache file exists and is valid', () => {
    const cached = { containers: [makeContainer()], ts: 1700000000000 };
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(cached));

    const result = loadCachedContainers();
    expect(result).toEqual(cached);
  });

  it('returns null when cache file does not exist', () => {
    mockFs.existsSync.mockImplementation((p: string) => p === DATA_DIR);
    const result = loadCachedContainers();
    expect(result).toBeNull();
  });

  it('returns null when JSON is malformed', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('{invalid json}}}');

    const result = loadCachedContainers();
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('returns null when containers field is missing', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ ts: 123 }));

    const result = loadCachedContainers();
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('returns null when containers field is not an array', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ containers: 'oops', ts: 123 }));

    const result = loadCachedContainers();
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('returns null when ts field is missing', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ containers: [] }));

    const result = loadCachedContainers();
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('returns null when ts is NaN', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ containers: [], ts: NaN }));

    const result = loadCachedContainers();
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('returns null when ts is Infinity', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ containers: [], ts: Infinity }));

    const result = loadCachedContainers();
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('returns null when readFileSync throws', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const result = loadCachedContainers();
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('creates DATA_DIR if it does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    loadCachedContainers();
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(DATA_DIR, { recursive: true });
  });

  it('reads from the correct file path', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ containers: [], ts: 0 }));
    loadCachedContainers();
    expect(mockFs.readFileSync).toHaveBeenCalledWith(CACHE_FILE, 'utf-8');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// saveCachedContainers
// ────────────────────────────────────────────────────────────────────────────
describe('saveCachedContainers', () => {
  it('writes to a tmp file then renames to the final path', () => {
    mockFs.existsSync.mockReturnValue(true);
    saveCachedContainers([makeContainer()]);

    const writtenPath = mockFs.writeFileSync.mock.calls[0][0] as string;
    expect(writtenPath).toMatch(TMP_FILE_PATTERN);
    expect(mockFs.renameSync).toHaveBeenCalledWith(writtenPath, CACHE_FILE);
  });

  it('includes containers array and ts in the written data', () => {
    mockFs.existsSync.mockReturnValue(true);
    const containers = [makeContainer()];
    saveCachedContainers(containers);

    const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
    expect(written.containers).toEqual(containers);
    expect(typeof written.ts).toBe('number');
    expect(written.ts).toBeGreaterThan(0);
  });

  it('calls writeFileSync before renameSync', () => {
    mockFs.existsSync.mockReturnValue(true);
    const callOrder: string[] = [];
    mockFs.writeFileSync.mockImplementation(() => callOrder.push('write'));
    mockFs.renameSync.mockImplementation(() => callOrder.push('rename'));

    saveCachedContainers([]);
    expect(callOrder).toEqual(['write', 'rename']);
  });

  it('creates DATA_DIR if it does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    saveCachedContainers([]);
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(DATA_DIR, { recursive: true });
  });

  it('cleans up tmp file if renameSync fails', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.renameSync.mockImplementation(() => {
      throw new Error('Rename failed');
    });

    expect(() => saveCachedContainers([])).toThrow('Rename failed');
    const writtenPath = mockFs.writeFileSync.mock.calls[0][0] as string;
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(writtenPath);
  });

  it('does not throw if tmp cleanup also fails after rename failure', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.renameSync.mockImplementation(() => {
      throw new Error('Rename failed');
    });
    mockFs.unlinkSync.mockImplementation(() => {
      throw new Error('Cleanup failed');
    });

    expect(() => saveCachedContainers([])).toThrow('Rename failed');
  });

  it('propagates error when writeFileSync throws', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.writeFileSync.mockImplementation(() => {
      throw new Error('Disk full');
    });
    expect(() => saveCachedContainers([])).toThrow('Disk full');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ensureDataDir caching
// ────────────────────────────────────────────────────────────────────────────
describe('ensureDataDir caching', () => {
  it('only calls mkdirSync once across multiple calls', () => {
    mockFs.existsSync.mockReturnValue(false);
    loadCachedContainers();
    expect(mockFs.mkdirSync).toHaveBeenCalledTimes(1);

    mockFs.mkdirSync.mockClear();
    loadCachedContainers();
    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
  });

  it('rechecks after resetCacheDirFlag()', () => {
    mockFs.existsSync.mockReturnValue(false);
    loadCachedContainers();
    expect(mockFs.mkdirSync).toHaveBeenCalledTimes(1);

    resetCacheDirFlag();
    mockFs.mkdirSync.mockClear();
    mockFs.existsSync.mockReturnValue(false);
    loadCachedContainers();
    expect(mockFs.mkdirSync).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Round-trip
// ────────────────────────────────────────────────────────────────────────────
describe('round-trip', () => {
  it('save then load returns equivalent container data', () => {
    mockFs.existsSync.mockReturnValue(true);
    const containers = [makeContainer(), makeContainer({ id: 'compose.yml::radarr', name: 'radarr' })];

    let writtenData = '';
    mockFs.writeFileSync.mockImplementation((_p: string, data: string) => {
      writtenData = data;
    });
    saveCachedContainers(containers);

    mockFs.readFileSync.mockReturnValue(writtenData);
    const loaded = loadCachedContainers();
    expect(loaded).toBeDefined();
    expect(loaded?.containers).toEqual(containers);
    expect(typeof loaded?.ts).toBe('number');
  });
});
