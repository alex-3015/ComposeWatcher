import { describe, expect, it, vi } from 'vitest';
import type { ContainerInfo } from '../../types.js';
import {
  ContainerCatalog,
  ContainerNotFoundError,
  type ContainerCatalogDependencies,
} from '../containerCatalog.js';

function container(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'compose.yml::app',
    name: 'app',
    image: 'owner/app',
    currentVersion: '1.0.0',
    composeFile: 'compose.yml',
    githubRepo: 'owner/app',
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
    ...overrides,
  };
}

function dependencies(overrides: Partial<ContainerCatalogDependencies> = {}) {
  const current = container();
  return {
    scan: vi.fn().mockResolvedValue([current]),
    enrich: vi.fn().mockImplementation(async (containers: ContainerInfo[]) => ({
      containers,
      githubRateLimit: null,
    })),
    loadConfig: vi.fn().mockResolvedValue({ repoMappings: {} }),
    setRepoMapping: vi.fn().mockResolvedValue(undefined),
    loadSnapshot: vi.fn().mockResolvedValue({
      schemaVersion: 4,
      containers: [current],
      ts: Date.now(),
      refreshedAt: new Date().toISOString(),
      githubRateLimit: null,
    }),
    saveSnapshot: vi.fn().mockResolvedValue(undefined),
    listIcons: vi.fn().mockResolvedValue(new Set<string>()),
    downloadIcons: vi.fn().mockResolvedValue(new Set<string>()),
    ...overrides,
  } as ContainerCatalogDependencies;
}

const logger = { warn: vi.fn(), error: vi.fn() };

describe('ContainerCatalog', () => {
  it('serves a lightweight snapshot without waiting for GitHub', async () => {
    const deps = dependencies();
    const catalog = new ContainerCatalog(logger, deps);
    await catalog.initialize(false);
    const response = catalog.list();
    expect(response.data[0]).not.toHaveProperty('releaseNotes');
    expect(response.data[0].dataState).toBe('pending');
    expect(deps.enrich).not.toHaveBeenCalled();
    await catalog.close();
  });

  it('projects URLs only for icons present in the startup index', async () => {
    const first = container();
    const second = container({ id: 'compose.yml::database', name: 'database' });
    const deps = dependencies({
      scan: vi.fn().mockResolvedValue([first, second]),
      loadSnapshot: vi.fn().mockResolvedValue({
        schemaVersion: 4,
        containers: [first, second],
        ts: Date.now(),
        refreshedAt: new Date().toISOString(),
        githubRateLimit: null,
      }),
      listIcons: vi.fn().mockResolvedValue(new Set(['app.png'])),
    });
    const catalog = new ContainerCatalog(logger, deps);
    await catalog.initialize(false);
    expect(catalog.list().data.map(({ name, iconUrl }) => ({ name, iconUrl }))).toEqual([
      { name: 'app', iconUrl: '/icons/app.png' },
      { name: 'database', iconUrl: null },
    ]);
    await catalog.close();
  });

  it('adds successfully downloaded icons to later projections', async () => {
    const deps = dependencies({
      downloadIcons: vi.fn().mockResolvedValue(new Set(['app.png'])),
    });
    const catalog = new ContainerCatalog(logger, deps);
    await catalog.initialize(false);
    expect(catalog.list().data[0].iconUrl).toBeNull();
    catalog.startGlobalRefresh();
    await vi.waitFor(() => expect(catalog.list().meta.refresh.state).toBe('idle'));
    await vi.waitFor(() => expect(catalog.list().data[0].iconUrl).toBe('/icons/app.png'));
    await catalog.close();
  });

  it('coalesces concurrent global refresh requests', async () => {
    let resolve!: (value: { containers: ContainerInfo[]; githubRateLimit: null }) => void;
    const deps = dependencies({
      enrich: vi.fn().mockReturnValue(new Promise((done) => (resolve = done))),
    });
    const catalog = new ContainerCatalog(logger, deps);
    await catalog.initialize(false);
    expect(catalog.startGlobalRefresh()).toMatchObject({ state: 'running', scope: 'all' });
    expect(catalog.startGlobalRefresh()).toMatchObject({ state: 'running', scope: 'all' });
    await vi.waitFor(() => expect(deps.enrich).toHaveBeenCalledOnce());
    resolve({ containers: [container()], githubRateLimit: null });
    await vi.waitFor(() => expect(catalog.list().meta.refresh.state).toBe('idle'));
    await catalog.close();
  });

  it('checks only the affected container after a mapping change', async () => {
    const first = container();
    const second = container({ id: 'compose.yml::database', name: 'database' });
    const deps = dependencies({
      scan: vi.fn().mockResolvedValue([first, second]),
      loadSnapshot: vi.fn().mockResolvedValue({
        schemaVersion: 4,
        containers: [first, second],
        ts: Date.now(),
        refreshedAt: new Date().toISOString(),
        githubRateLimit: null,
      }),
    });
    const catalog = new ContainerCatalog(logger, deps);
    await catalog.initialize(false);
    const response = await catalog.updateRepository('compose.yml::app', 'custom/app');
    expect(response.data).toMatchObject({ githubRepo: 'custom/app', dataState: 'pending' });
    await vi.waitFor(() => expect(deps.enrich).toHaveBeenCalledOnce());
    expect(vi.mocked(deps.enrich).mock.calls[0][0]).toHaveLength(1);
    expect(vi.mocked(deps.enrich).mock.calls[0][0][0].id).toBe('compose.yml::app');
    await catalog.close();
  });

  it('persists an explicit unlink without starting GitHub work', async () => {
    const deps = dependencies();
    const catalog = new ContainerCatalog(logger, deps);
    await catalog.initialize(false);
    const response = await catalog.updateRepository('compose.yml::app', null);
    expect(response.data).toMatchObject({
      githubRepo: null,
      status: 'no-repo',
      dataState: 'unlinked',
    });
    expect(deps.enrich).not.toHaveBeenCalled();
    expect(deps.saveSnapshot).toHaveBeenCalled();
    await catalog.close();
  });

  it('does not let an old global refresh overwrite a newer mapping', async () => {
    let resolveGlobal!: (value: { containers: ContainerInfo[]; githubRateLimit: null }) => void;
    const enrich = vi
      .fn()
      .mockImplementationOnce(() => new Promise((done) => (resolveGlobal = done)))
      .mockImplementationOnce(async (containers: ContainerInfo[]) => ({
        containers: containers.map((candidate) => ({
          ...candidate,
          latestUpstreamVersion: '2.0.0',
        })),
        githubRateLimit: null,
      }));
    const deps = dependencies({ enrich });
    const catalog = new ContainerCatalog(logger, deps);
    await catalog.initialize(false);
    catalog.startGlobalRefresh();
    await vi.waitFor(() => expect(enrich).toHaveBeenCalledTimes(1));
    await catalog.updateRepository('compose.yml::app', 'new/repo');
    await vi.waitFor(() => expect(enrich).toHaveBeenCalledTimes(2));
    resolveGlobal({ containers: [container({ githubRepo: 'owner/app' })], githubRateLimit: null });
    await vi.waitFor(() => expect(catalog.list().meta.refresh.state).toBe('idle'));
    expect(catalog.detail('compose.yml::app').githubRepo).toBe('new/repo');
    await catalog.close();
  });

  it('aborts an obsolete targeted check and checks the newest mapping', async () => {
    let firstSignal: AbortSignal | undefined;
    const enrich = vi
      .fn()
      .mockImplementationOnce(
        async (_containers: ContainerInfo[], _logger: unknown, signal?: AbortSignal) => {
          firstSignal = signal;
          return new Promise((_resolve, reject) =>
            signal?.addEventListener('abort', () =>
              reject(new DOMException('Superseded', 'AbortError')),
            ),
          );
        },
      )
      .mockImplementationOnce(async (containers: ContainerInfo[]) => ({
        containers: containers.map((candidate) => ({
          ...candidate,
          latestUpstreamVersion: '3.0.0',
          status: 'update-available' as const,
        })),
        githubRateLimit: null,
      }));
    const catalog = new ContainerCatalog(logger, dependencies({ enrich }));
    await catalog.initialize(false);
    await catalog.updateRepository('compose.yml::app', 'first/app');
    await vi.waitFor(() => expect(firstSignal).toBeDefined());
    await catalog.updateRepository('compose.yml::app', 'newest/app');
    await vi.waitFor(() => expect(enrich).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(catalog.detail('compose.yml::app').latestUpstreamVersion).toBe('3.0.0'),
    );
    expect(firstSignal?.aborted).toBe(true);
    expect(catalog.detail('compose.yml::app').githubRepo).toBe('newest/app');
    await catalog.close();
  });

  it('aborts a targeted check when the container is unlinked', async () => {
    let signal: AbortSignal | undefined;
    const enrich = vi
      .fn()
      .mockImplementation(
        async (_containers: ContainerInfo[], _logger: unknown, currentSignal?: AbortSignal) => {
          signal = currentSignal;
          return new Promise((_resolve, reject) =>
            currentSignal?.addEventListener('abort', () =>
              reject(new DOMException('Unlinked', 'AbortError')),
            ),
          );
        },
      );
    const catalog = new ContainerCatalog(logger, dependencies({ enrich }));
    await catalog.initialize(false);
    await catalog.updateRepository('compose.yml::app', 'temporary/app');
    await vi.waitFor(() => expect(signal).toBeDefined());
    const response = await catalog.updateRepository('compose.yml::app', null);
    expect(signal?.aborted).toBe(true);
    expect(response.data).toMatchObject({ githubRepo: null, dataState: 'unlinked' });
    expect(enrich).toHaveBeenCalledOnce();
    await catalog.close();
  });

  it('marks cached fallback data as stale', async () => {
    const stale = container({ releaseDataStale: true, lastChecked: '2026-01-01T00:00:00.000Z' });
    const deps = dependencies({
      loadSnapshot: vi.fn().mockResolvedValue({
        schemaVersion: 4,
        containers: [stale],
        ts: Date.now(),
        refreshedAt: '2026-01-01T00:00:00.000Z',
        githubRateLimit: null,
      }),
    });
    const catalog = new ContainerCatalog(logger, deps);
    await catalog.initialize(false);
    expect(catalog.detail(stale.id).dataState).toBe('stale');
    await catalog.close();
  });

  it('throws a typed error for unknown IDs', async () => {
    const catalog = new ContainerCatalog(logger, dependencies());
    await catalog.initialize(false);
    expect(() => catalog.detail('compose.yml::missing')).toThrow(ContainerNotFoundError);
    await catalog.close();
  });

  it('aborts in-flight GitHub work during shutdown', async () => {
    let observedSignal: AbortSignal | undefined;
    const deps = dependencies({
      enrich: vi
        .fn()
        .mockImplementation(
          async (_containers: ContainerInfo[], _logger: unknown, signal?: AbortSignal) => {
            observedSignal = signal;
            return new Promise((_resolve, reject) =>
              signal?.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError')),
              ),
            );
          },
        ),
    });
    const catalog = new ContainerCatalog(logger, deps);
    await catalog.initialize(false);
    catalog.startGlobalRefresh();
    await vi.waitFor(() => expect(observedSignal).toBeDefined());
    await catalog.close();
    expect(observedSignal?.aborted).toBe(true);
  });
});
