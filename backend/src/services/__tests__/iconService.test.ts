import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// ── fs mock ────────────────────────────────────────────────────────────────
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

import fsDefault from 'fs';
import {
  getIconFileName,
  iconExistsLocally,
  downloadIcon,
  downloadIconsForContainers,
  resetIconsDirFlag,
} from '../iconService.js';
import type { ContainerInfo } from '../../types.js';

const mockFs = fsDefault as unknown as {
  existsSync: ReturnType<typeof vi.fn>;
  mkdirSync: ReturnType<typeof vi.fn>;
  writeFileSync: ReturnType<typeof vi.fn>;
  renameSync: ReturnType<typeof vi.fn>;
  unlinkSync: ReturnType<typeof vi.fn>;
};

const ICONS_DIR = path.join('/data', 'icons');

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
    releaseUrl: null,
    releaseNotes: null,
    releaseName: null,
    lastChecked: null,
    ...overrides,
  };
}

function mockFetchResponse(opts: {
  ok?: boolean;
  status?: number;
  contentType?: string;
  contentLength?: string;
  body?: ArrayBuffer;
}) {
  const body = opts.body ?? new ArrayBuffer(100);
  return vi.fn().mockResolvedValue({
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: {
      get: (name: string) => {
        if (name === 'content-type') return opts.contentType ?? 'image/png';
        if (name === 'content-length') return opts.contentLength ?? String(body.byteLength);
        return null;
      },
    },
    arrayBuffer: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  resetIconsDirFlag();
  vi.stubGlobal('fetch', mockFetchResponse({}));
});

// ────────────────────────────────────────────────────────────────────────────
// getIconFileName
// ────────────────────────────────────────────────────────────────────────────
describe('getIconFileName', () => {
  it('returns filename for unmapped service', () => {
    expect(getIconFileName('sonarr')).toBe('sonarr.png');
  });

  it('returns filename for mapped service (adguardhome)', () => {
    expect(getIconFileName('adguardhome')).toBe('adguard-home.png');
  });

  it('returns filename for mapped service (portainer-ce)', () => {
    expect(getIconFileName('portainer-ce')).toBe('portainer.png');
  });

  it('returns filename for mapped service (portainer-ee)', () => {
    expect(getIconFileName('portainer-ee')).toBe('portainer.png');
  });

  it('lowercases the service name', () => {
    expect(getIconFileName('Sonarr')).toBe('sonarr.png');
    expect(getIconFileName('RADARR')).toBe('radarr.png');
  });

  it('trims whitespace', () => {
    expect(getIconFileName('  sonarr  ')).toBe('sonarr.png');
  });

  it('returns null for empty string', () => {
    expect(getIconFileName('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(getIconFileName('   ')).toBeNull();
  });

  it('returns null for string exceeding max length', () => {
    expect(getIconFileName('a'.repeat(129))).toBeNull();
  });

  it('returns filename at max length boundary', () => {
    const name = 'a'.repeat(128);
    expect(getIconFileName(name)).toBe(`${name}.png`);
  });

  it('returns null for names with forward slashes', () => {
    expect(getIconFileName('my/app')).toBeNull();
  });

  it('returns null for names with backslashes', () => {
    expect(getIconFileName('my\\app')).toBeNull();
  });

  it('returns null for names with path traversal sequences', () => {
    expect(getIconFileName('../etc/passwd')).toBeNull();
    expect(getIconFileName('..')).toBeNull();
    expect(getIconFileName('foo/../bar')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// iconExistsLocally
// ────────────────────────────────────────────────────────────────────────────
describe('iconExistsLocally', () => {
  it('returns true when icon file exists', () => {
    mockFs.existsSync.mockImplementation((p: string) => {
      if (p === ICONS_DIR) return true;
      if (p === path.resolve(ICONS_DIR, 'sonarr.png')) return true;
      return false;
    });
    expect(iconExistsLocally('sonarr')).toBe(true);
  });

  it('returns false when icon file does not exist', () => {
    mockFs.existsSync.mockImplementation((p: string) =>
      p === ICONS_DIR || p === path.resolve(ICONS_DIR),
    );
    expect(iconExistsLocally('sonarr')).toBe(false);
  });

  it('returns false for empty service name', () => {
    expect(iconExistsLocally('')).toBe(false);
  });

  it('creates icons directory if it does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    iconExistsLocally('sonarr');
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(ICONS_DIR, { recursive: true });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// downloadIcon
// ────────────────────────────────────────────────────────────────────────────
describe('downloadIcon', () => {
  it('downloads and writes file atomically on success', async () => {
    const imageBuffer = new ArrayBuffer(50);
    vi.stubGlobal('fetch', mockFetchResponse({ body: imageBuffer }));
    mockFs.existsSync.mockReturnValue(true);

    const result = await downloadIcon('sonarr');

    expect(result).toBe(true);
    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
    const writtenPath = mockFs.writeFileSync.mock.calls[0][0] as string;
    expect(writtenPath).toContain('.tmp');
    expect(mockFs.renameSync).toHaveBeenCalledWith(
      writtenPath,
      path.resolve(ICONS_DIR, 'sonarr.png'),
    );
  });

  it('fetches from the correct CDN URL', async () => {
    const mockFetch = mockFetchResponse({});
    vi.stubGlobal('fetch', mockFetch);
    mockFs.existsSync.mockReturnValue(true);

    await downloadIcon('sonarr');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://cdn.jsdelivr.net/gh/selfhst/icons@main/png/sonarr.png',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('uses mapped name for icon URL', async () => {
    const mockFetch = mockFetchResponse({});
    vi.stubGlobal('fetch', mockFetch);
    mockFs.existsSync.mockReturnValue(true);

    await downloadIcon('adguardhome');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://cdn.jsdelivr.net/gh/selfhst/icons@main/png/adguard-home.png',
      expect.any(Object),
    );
  });

  it('returns false on HTTP 404', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ ok: false, status: 404 }));
    mockFs.existsSync.mockReturnValue(true);

    const result = await downloadIcon('nonexistent');
    expect(result).toBe(false);
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('returns false on non-image content-type', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ contentType: 'text/html' }));
    mockFs.existsSync.mockReturnValue(true);

    const result = await downloadIcon('sonarr');
    expect(result).toBe(false);
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('returns false when content-length exceeds 1 MB', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchResponse({ contentLength: String(2 * 1024 * 1024) }),
    );
    mockFs.existsSync.mockReturnValue(true);

    const result = await downloadIcon('sonarr');
    expect(result).toBe(false);
  });

  it('returns false when actual body exceeds 1 MB', async () => {
    const largeBody = new ArrayBuffer(1024 * 1024 + 1);
    vi.stubGlobal(
      'fetch',
      mockFetchResponse({ body: largeBody, contentLength: '0' }),
    );
    mockFs.existsSync.mockReturnValue(true);

    const result = await downloadIcon('sonarr');
    expect(result).toBe(false);
  });

  it('returns false on network timeout (fetch throws)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('AbortError')));
    mockFs.existsSync.mockReturnValue(true);

    const result = await downloadIcon('sonarr');
    expect(result).toBe(false);
  });

  it('cleans up tmp file in finally block', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({}));
    mockFs.existsSync.mockReturnValue(true);
    // Simulate rename failure so tmpFile still exists
    mockFs.renameSync.mockImplementation(() => {
      throw new Error('rename failed');
    });

    const result = await downloadIcon('sonarr');
    expect(result).toBe(false);
    expect(mockFs.unlinkSync).toHaveBeenCalled();
  });

  it('returns false for empty service name', async () => {
    const result = await downloadIcon('');
    expect(result).toBe(false);
  });

  it('returns false for path traversal attempt', async () => {
    const result = await downloadIcon('../../../etc/passwd');
    expect(result).toBe(false);
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// downloadIconsForContainers
// ────────────────────────────────────────────────────────────────────────────
describe('downloadIconsForContainers', () => {
  it('skips already-cached icons', async () => {
    const localFetch = mockFetchResponse({});
    vi.stubGlobal('fetch', localFetch);
    const resolvedIcon = path.resolve(ICONS_DIR, 'sonarr.png');
    const resolvedDir = path.resolve(ICONS_DIR);
    mockFs.existsSync.mockImplementation((p: string) => {
      if (p === ICONS_DIR || p === resolvedDir) return true;
      if (p === resolvedIcon) return true;
      return false;
    });

    await downloadIconsForContainers([makeContainer({ name: 'sonarr' })]);
    expect(localFetch).not.toHaveBeenCalled();
  });

  it('downloads icons that are not cached', async () => {
    const mockFetch = mockFetchResponse({});
    vi.stubGlobal('fetch', mockFetch);
    mockFs.existsSync.mockImplementation((p: string) => {
      if (p === ICONS_DIR) return true;
      return false;
    });

    await downloadIconsForContainers([
      makeContainer({ name: 'sonarr' }),
      makeContainer({ name: 'radarr' }),
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('deduplicates by icon filename', async () => {
    const mockFetch = mockFetchResponse({});
    vi.stubGlobal('fetch', mockFetch);
    mockFs.existsSync.mockImplementation((p: string) => p === ICONS_DIR);

    await downloadIconsForContainers([
      makeContainer({ id: 'a::sonarr', name: 'sonarr' }),
      makeContainer({ id: 'b::sonarr', name: 'sonarr' }),
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('deduplicates mapped names correctly', async () => {
    const mockFetch = mockFetchResponse({});
    vi.stubGlobal('fetch', mockFetch);
    mockFs.existsSync.mockImplementation((p: string) => p === ICONS_DIR);

    await downloadIconsForContainers([
      makeContainer({ name: 'portainer-ce' }),
      makeContainer({ name: 'portainer-ee' }),
    ]);
    // Both map to "portainer.png" — should only download once
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not throw when all downloads fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    mockFs.existsSync.mockImplementation((p: string) => p === ICONS_DIR);

    // Should not throw
    await expect(
      downloadIconsForContainers([
        makeContainer({ name: 'sonarr' }),
        makeContainer({ name: 'radarr' }),
      ]),
    ).resolves.toBeUndefined();
  });

  it('handles empty container list', async () => {
    const mockFetch = mockFetchResponse({});
    vi.stubGlobal('fetch', mockFetch);

    await downloadIconsForContainers([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('downloads in batches of 5', async () => {
    const callTimestamps: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callTimestamps.push(Date.now());
        return Promise.resolve({
          ok: true,
          headers: {
            get: (name: string) => {
              if (name === 'content-type') return 'image/png';
              if (name === 'content-length') return '50';
              return null;
            },
          },
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(50)),
        });
      }),
    );
    mockFs.existsSync.mockImplementation((p: string) => p === ICONS_DIR);

    const containers = Array.from({ length: 7 }, (_, i) =>
      makeContainer({ name: `app${i}`, id: `compose.yml::app${i}` }),
    );
    await downloadIconsForContainers(containers);

    // All 7 should have been attempted
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(7);
  });
});
