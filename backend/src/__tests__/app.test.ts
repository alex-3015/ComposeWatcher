import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContainerInfo } from '../types.js';
import type { EnrichmentResult } from '../services/githubService.js';

vi.mock('../services/dockerService.js', () => ({ scanDockerDir: vi.fn() }));
vi.mock('../services/githubService.js', () => ({ enrichWithGithubData: vi.fn() }));
vi.mock('../services/configService.js', () => ({
  loadConfig: vi.fn(),
  setRepoMapping: vi.fn(),
}));
vi.mock('../services/cacheService.js', () => ({
  loadCachedContainers: vi.fn(),
  saveCachedContainers: vi.fn(),
}));
vi.mock('../services/iconService.js', () => ({ downloadIconsForContainers: vi.fn() }));

import { buildApp } from '../app.js';
import { scanDockerDir } from '../services/dockerService.js';
import { enrichWithGithubData } from '../services/githubService.js';
import { loadConfig, setRepoMapping } from '../services/configService.js';
import { loadCachedContainers, saveCachedContainers } from '../services/cacheService.js';
import { downloadIconsForContainers } from '../services/iconService.js';

const mockScanDockerDir = vi.mocked(scanDockerDir);
const mockEnrichWithGithubData = vi.mocked(enrichWithGithubData);
const mockLoadConfig = vi.mocked(loadConfig);
const mockSetRepoMapping = vi.mocked(setRepoMapping);
const mockLoadCachedContainers = vi.mocked(loadCachedContainers);
const mockSaveCachedContainers = vi.mocked(saveCachedContainers);
const mockDownloadIcons = vi.mocked(downloadIconsForContainers);

function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'docker-compose.yml::sonarr',
    name: 'sonarr',
    image: 'ghcr.io/linuxserver/sonarr',
    currentVersion: '4.0.0',
    composeFile: 'docker-compose.yml',
    githubRepo: 'linuxserver/sonarr',
    latestUpstreamVersion: '4.0.0',
    publishedAt: '2026-07-13T12:00:00.000Z',
    status: 'up-to-date',
    updateKind: null,
    comparisonMode: 'exact',
    historyComplete: true,
    releaseDataStale: false,
    checkIssue: null,
    breakingChanges: [],
    releaseUrl: 'https://github.com/linuxserver/sonarr/releases/tag/4.0.0',
    releaseNotes: null,
    releaseName: null,
    lastChecked: '2026-07-13T12:00:00.000Z',
    ...overrides,
  };
}

function setupMocks(): void {
  vi.resetAllMocks();
  mockLoadConfig.mockReturnValue({ repoMappings: {} });
  mockScanDockerDir.mockResolvedValue([makeContainer()]);
  mockLoadCachedContainers.mockReturnValue(null);
  mockEnrichWithGithubData.mockImplementation(async (containers) => ({
    containers,
    githubRateLimit: null,
  }));
  mockDownloadIcons.mockResolvedValue(undefined);
}

describe('Compose Watcher API', () => {
  beforeEach(() => {
    setupMocks();
    delete process.env.CORS_ORIGIN;
    process.env.CACHE_TTL_MS = '1000';
  });

  afterEach(() => {
    delete process.env.CORS_ORIGIN;
    delete process.env.CACHE_TTL_MS;
  });

  it('returns a side-effect-free health response', async () => {
    const app = await buildApp({ logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { status: 'ok' } });
    expect(mockScanDockerDir).not.toHaveBeenCalled();
    expect(mockEnrichWithGithubData).not.toHaveBeenCalled();
    await app.close();
  });

  it('keeps the health endpoint responsive while an asynchronous scan is pending', async () => {
    let resolveScan!: (containers: ContainerInfo[]) => void;
    mockScanDockerDir.mockReturnValue(
      new Promise((resolve) => {
        resolveScan = resolve;
      }),
    );
    const app = await buildApp({ logger: false });
    const containersRequest = app.inject({ method: 'GET', url: '/api/containers' });
    await vi.waitFor(() => expect(mockScanDockerDir).toHaveBeenCalled());

    const health = await app.inject({ method: 'GET', url: '/api/health' });

    expect(health.statusCode).toBe(200);
    resolveScan([makeContainer()]);
    expect((await containersRequest).statusCode).toBe(200);
    await app.close();
  });

  it('returns containers in the v2 response envelope', async () => {
    const app = await buildApp({ logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/containers' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('sonarr');
    expect(body.meta).toMatchObject({ stale: false, refreshing: false, refreshError: null });
    expect(body.meta.refreshedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mockSaveCachedContainers).toHaveBeenCalledWith(body.data, null);
    await app.close();
  });

  it('applies persisted repository mappings before enrichment', async () => {
    mockLoadConfig.mockReturnValue({
      repoMappings: { 'docker-compose.yml::sonarr': 'custom/sonarr' },
    });
    const app = await buildApp({ logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/containers' });

    expect(response.json().data[0].githubRepo).toBe('custom/sonarr');
    expect(mockEnrichWithGithubData).toHaveBeenCalledWith(
      [expect.objectContaining({ githubRepo: 'custom/sonarr' })],
      expect.anything(),
    );
    await app.close();
  });

  it('uses a fresh disk cache without triggering a scan', async () => {
    mockLoadCachedContainers.mockReturnValue({
      schemaVersion: 3,
      containers: [makeContainer({ name: 'cached' })],
      ts: Date.now(),
      githubRateLimit: null,
    });
    const app = await buildApp({ logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/containers' });

    expect(response.json()).toMatchObject({ data: [{ name: 'cached' }], meta: { stale: false } });
    expect(mockScanDockerDir).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns stale data immediately and starts background revalidation', async () => {
    let resolveRefresh!: (result: EnrichmentResult) => void;
    mockLoadCachedContainers.mockReturnValue({
      schemaVersion: 3,
      containers: [makeContainer({ name: 'cached' })],
      ts: Date.now() - 10_000,
      githubRateLimit: null,
    });
    mockEnrichWithGithubData.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const app = await buildApp({ logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/containers' });

    expect(response.json()).toMatchObject({
      data: [{ name: 'cached' }],
      meta: { stale: true, refreshing: true },
    });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(1);
    resolveRefresh({ containers: [makeContainer()], githubRateLimit: null });
    await vi.waitFor(() => expect(mockSaveCachedContainers).toHaveBeenCalled());
    await app.close();
  });

  it('keeps stale data and exposes a background refresh failure without a retry loop', async () => {
    mockLoadCachedContainers.mockReturnValue({
      schemaVersion: 3,
      containers: [makeContainer({ name: 'cached' })],
      ts: Date.now() - 10_000,
      githubRateLimit: null,
    });
    mockScanDockerDir.mockRejectedValue(new Error('offline'));
    const app = await buildApp({ logger: false });
    const first = await app.inject({ method: 'GET', url: '/api/containers' });
    expect(first.json().data[0].name).toBe('cached');
    await vi.waitFor(() => expect(mockScanDockerDir).toHaveBeenCalledTimes(1));

    const second = await app.inject({ method: 'GET', url: '/api/containers' });
    expect(second.json()).toMatchObject({
      data: [{ name: 'cached' }],
      meta: {
        stale: true,
        refreshing: false,
        refreshError: { code: 'REFRESH_FAILED' },
      },
    });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('coalesces simultaneous forced refreshes', async () => {
    let resolveRefresh!: (result: EnrichmentResult) => void;
    mockEnrichWithGithubData.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const app = await buildApp({ logger: false });
    const first = app.inject({ method: 'GET', url: '/api/containers?refresh=true' });
    const second = app.inject({ method: 'GET', url: '/api/containers?refresh=true' });
    await vi.waitFor(() => expect(mockEnrichWithGithubData).toHaveBeenCalledTimes(1));
    resolveRefresh({ containers: [makeContainer()], githubRateLimit: null });

    expect((await first).statusCode).toBe(200);
    expect((await second).statusCode).toBe(200);
    expect(mockScanDockerDir).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('returns structured errors without leaking internal details', async () => {
    mockScanDockerDir.mockRejectedValue(new Error('secret path /docker/private'));
    const app = await buildApp({ logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/containers' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' },
    });
    expect(response.body).not.toContain('/docker/private');
    await app.close();
  });

  it('rejects unsupported refresh query values', async () => {
    const app = await buildApp({ logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/containers?refresh=yes' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request.' },
    });
    await app.close();
  });

  it('persists a valid repository mapping and returns an envelope', async () => {
    const app = await buildApp({ logger: false });
    const response = await app.inject({
      method: 'POST',
      url: `/api/containers/${encodeURIComponent('docker-compose.yml::sonarr')}/repo`,
      payload: { repo: 'custom/sonarr' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { id: 'docker-compose.yml::sonarr', githubRepo: 'custom/sonarr' },
    });
    expect(mockSetRepoMapping).toHaveBeenCalledWith(
      'docker-compose.yml::sonarr',
      'custom/sonarr',
      expect.any(Object),
    );
    await app.close();
  });

  it('returns 404 when mapping an unknown container', async () => {
    const app = await buildApp({ logger: false });
    const response = await app.inject({
      method: 'POST',
      url: `/api/containers/${encodeURIComponent('other.yml::missing')}/repo`,
      payload: { repo: 'custom/missing' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('CONTAINER_NOT_FOUND');
    expect(mockSetRepoMapping).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([{}, { repo: 'invalid' }, { repo: 42 }, { repo: 'owner/repo', extra: true }])(
    'rejects invalid mapping payload %#',
    async (payload) => {
      const app = await buildApp({ logger: false });
      const response = await app.inject({
        method: 'POST',
        url: `/api/containers/${encodeURIComponent('docker-compose.yml::sonarr')}/repo`,
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    },
  );

  it('wraps configuration data', async () => {
    mockLoadConfig.mockReturnValue({ repoMappings: { 'a::b': 'owner/repo' } });
    const app = await buildApp({ logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/config' });

    expect(response.json()).toEqual({ data: { repoMappings: { 'a::b': 'owner/repo' } } });
    await app.close();
  });

  it('does not enable CORS unless configured', async () => {
    const app = await buildApp({ logger: false });
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/containers',
      headers: { origin: 'https://example.com', 'access-control-request-method': 'GET' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });

  it('allows only configured CORS origins', async () => {
    process.env.CORS_ORIGIN = 'https://trusted.example';
    const app = await buildApp({ logger: false });
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/containers',
      headers: {
        origin: 'https://trusted.example',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBe('https://trusted.example');
    await app.close();
  });
});
