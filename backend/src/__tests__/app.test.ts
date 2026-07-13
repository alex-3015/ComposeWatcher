import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ContainerDetail,
  ContainerSummary,
  ContainersResponse,
  RefreshMeta,
} from '@composewatcher/contracts';
import { buildApp } from '../app.js';
import { ContainerNotFoundError, type ContainerCatalogApi } from '../services/containerCatalog.js';

function summary(overrides: Partial<ContainerSummary> = {}): ContainerSummary {
  return {
    id: 'compose.yml::app',
    name: 'app',
    image: 'owner/app',
    currentVersion: '1.0.0',
    composeFile: 'compose.yml',
    githubRepo: 'owner/app',
    iconUrl: '/icons/app.png',
    latestUpstreamVersion: '1.1.0',
    publishedAt: '2026-01-01T00:00:00.000Z',
    status: 'update-available',
    dataState: 'fresh',
    updateKind: 'minor',
    comparisonMode: 'exact',
    checkIssue: null,
    breakingChangeCount: 0,
    releaseUrl: 'https://example.test/release',
    lastChecked: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function detail(overrides: Partial<ContainerDetail> = {}): ContainerDetail {
  return {
    ...summary(),
    historyComplete: true,
    releaseName: '1.1.0',
    releaseNotes: 'Notes',
    breakingChanges: [],
    ...overrides,
  };
}

const idleRefresh: RefreshMeta = {
  state: 'idle',
  scope: null,
  containerId: null,
  startedAt: null,
  finishedAt: null,
  error: null,
};

function catalog(): ContainerCatalogApi & Record<string, ReturnType<typeof vi.fn>> {
  const response: ContainersResponse = {
    data: [summary()],
    meta: { refresh: idleRefresh, refreshedAt: '2026-01-01T00:00:00.000Z', githubRateLimit: null },
  };
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockReturnValue(response),
    detail: vi.fn().mockImplementation((id: string) => {
      if (id !== 'compose.yml::app') throw new ContainerNotFoundError(id);
      return detail();
    }),
    startGlobalRefresh: vi.fn().mockReturnValue({ ...idleRefresh, state: 'running', scope: 'all' }),
    updateRepository: vi.fn().mockImplementation(async (id: string, repo: string | null) => ({
      data: summary({ id, githubRepo: repo, dataState: repo ? 'pending' : 'unlinked' }),
      meta: {
        refresh: {
          ...idleRefresh,
          state: repo ? 'running' : 'idle',
          scope: repo ? 'container' : null,
          containerId: repo ? id : null,
        },
      },
    })),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

let fakeCatalog: ReturnType<typeof catalog>;

beforeEach(() => {
  fakeCatalog = catalog();
});
afterEach(() => {
  delete process.env.CORS_ORIGIN;
});

async function app() {
  return buildApp({
    logger: false,
    catalog: fakeCatalog,
    refreshOnStart: false,
    serveFrontend: false,
  });
}

describe('v3 API', () => {
  it('exposes side-effect-free versioned health data', async () => {
    const server = await app();
    const response = await server.inject({ method: 'GET', url: '/api/health' });
    expect(response.json()).toEqual({ data: { status: 'ok', version: '3.0.0' } });
    expect(response.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(fakeCatalog.list).not.toHaveBeenCalled();
    await server.close();
  });

  it('returns summaries without large detail fields', async () => {
    const server = await app();
    const response = await server.inject({ method: 'GET', url: '/api/containers' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).not.toHaveProperty('releaseNotes');
    expect(response.json().data[0]).not.toHaveProperty('breakingChanges');
    expect(response.headers['cache-control']).toBe('no-store');
    await server.close();
  });

  it('returns on-demand container details', async () => {
    const server = await app();
    const response = await server.inject({
      method: 'GET',
      url: '/api/containers/compose.yml%3A%3Aapp',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.releaseNotes).toBe('Notes');
    await server.close();
  });

  it('returns a stable 404 for an unknown container', async () => {
    const server = await app();
    const response = await server.inject({
      method: 'GET',
      url: '/api/containers/compose.yml%3A%3Amissing',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'CONTAINER_NOT_FOUND', message: 'Container not found.' },
    });
    await server.close();
  });

  it('starts refresh idempotently through HTTP 202', async () => {
    const server = await app();
    const response = await server.inject({ method: 'POST', url: '/api/refresh' });
    expect(response.statusCode).toBe(202);
    expect(response.json().data).toMatchObject({ state: 'running', scope: 'all' });
    expect(fakeCatalog.startGlobalRefresh).toHaveBeenCalledOnce();
    await server.close();
  });

  it('updates one repository through the new PUT endpoint', async () => {
    const server = await app();
    const response = await server.inject({
      method: 'PUT',
      url: '/api/containers/compose.yml%3A%3Aapp/repository',
      payload: { repo: 'custom/app' },
    });
    expect(response.statusCode).toBe(202);
    expect(fakeCatalog.updateRepository).toHaveBeenCalledWith('compose.yml::app', 'custom/app');
    expect(response.json().data.dataState).toBe('pending');
    await server.close();
  });

  it.each([{}, { repo: 'invalid' }, { repo: 'owner/repo', extra: true }])(
    'rejects invalid repository payload %#',
    async (payload) => {
      const server = await app();
      const response = await server.inject({
        method: 'PUT',
        url: '/api/containers/compose.yml%3A%3Aapp/repository',
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await server.close();
    },
  );

  it('removes the deleted v2 endpoints', async () => {
    const server = await app();
    expect((await server.inject({ method: 'GET', url: '/api/config' })).statusCode).toBe(404);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/containers/compose.yml%3A%3Aapp/repo',
          payload: { repo: null },
        })
      ).statusCode,
    ).toBe(404);
    await server.close();
  });

  it('keeps a 100-container list below the 150 kB budget', async () => {
    vi.mocked(fakeCatalog.list).mockReturnValue({
      data: Array.from({ length: 100 }, (_, index) =>
        summary({ id: `compose.yml::app-${index}`, name: `app-${index}` }),
      ),
      meta: { refresh: idleRefresh, refreshedAt: null, githubRateLimit: null },
    });
    const server = await app();
    const response = await server.inject({ method: 'GET', url: '/api/containers' });
    expect(Buffer.byteLength(response.body)).toBeLessThanOrEqual(150_000);
    await server.close();
  });

  it('registers and removes an allowed CORS origin', async () => {
    process.env.CORS_ORIGIN = 'https://dashboard.example';
    const server = await app();
    const response = await server.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://dashboard.example' },
    });
    expect(response.headers['access-control-allow-origin']).toBe('https://dashboard.example');
    await server.close();
  });
});
