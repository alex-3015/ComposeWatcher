import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App.vue';
import type { ContainerSummary, RefreshMeta } from '../types';
import { detail, idleRefresh, meta, summary } from './factories';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const global = {
  stubs: [
    'Container',
    'RefreshCw',
    'CheckCircle',
    'AlertTriangle',
    'AlertCircle',
    'Package',
    'ExternalLink',
    'GitBranch',
    'X',
    'Search',
    'ChevronDown',
    'FolderOpen',
    'LayoutGrid',
    'List',
    'PanelRightOpen',
    'LoaderCircle',
  ],
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function listResponse(
  containers: ContainerSummary[],
  refresh: RefreshMeta = idleRefresh,
): Response {
  return response({ data: containers, meta: meta({ refresh }) });
}

async function mountLoaded(containers: ContainerSummary[]): Promise<VueWrapper> {
  fetchMock.mockResolvedValueOnce(listResponse(containers));
  const wrapper = mount(App, { global });
  await flushPromises();
  return wrapper;
}

afterEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
  vi.useRealTimers();
});

describe('v3 dashboard', () => {
  it('shows loading, data, empty, and initial error states', async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    const loading = mount(App, { global });
    expect(loading.text()).toContain('Scanning containers');
    loading.unmount();

    const populated = await mountLoaded([summary()]);
    expect(populated.text()).toContain('1 containers across 1 Compose files');
    expect(populated.text()).toContain('sonarr');
    populated.unmount();

    const empty = await mountLoaded([]);
    expect(empty.text()).toContain('No containers found');
    empty.unmount();

    fetchMock.mockResolvedValueOnce(
      response({ error: { code: 'INTERNAL_ERROR', message: 'Backend unavailable' } }, 500),
    );
    const failed = mount(App, { global });
    await flushPromises();
    expect(failed.get('[role="alert"]').text()).toContain('Backend unavailable');
    failed.unmount();
  });

  it('filters the action views and searches all requested summary fields', async () => {
    const wrapper = await mountLoaded([
      summary({ id: 'a', name: 'breaking', status: 'breaking-change' }),
      summary({ id: 'b', name: 'update', status: 'update-available', githubRepo: 'special/repo' }),
      summary({ id: 'c', name: 'stale', status: 'unknown', composeFile: 'infra/compose.yml' }),
      summary({ id: 'd', name: 'current', status: 'up-to-date', image: 'custom/image:1' }),
    ]);

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Check failed'))!
      .trigger('click');
    expect(wrapper.text()).toContain('stale');
    expect(wrapper.text()).not.toContain('current');
    expect(wrapper.get('[aria-label="Container filters"]').findAll('button')).toHaveLength(7);

    await wrapper
      .findAll('button')
      .find((button) => button.text().startsWith('All '))!
      .trigger('click');
    await wrapper.get('#container-search').setValue('special/repo');
    expect(wrapper.text()).toContain('update');
    expect(wrapper.text()).not.toContain('breaking');

    await wrapper.get('#container-search').setValue('infra/compose');
    expect(wrapper.text()).toContain('stale');
    wrapper.unmount();
  });

  it('fetches large detail fields only after opening the panel', async () => {
    fetchMock
      .mockResolvedValueOnce(listResponse([summary()]))
      .mockResolvedValueOnce(response({ data: detail() }));
    const wrapper = mount(App, { global });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('View details'))!
      .trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/containers/docker-compose.yml%3A%3Asonarr',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await vi.waitFor(() => expect(wrapper.get('[role="dialog"]').text()).toContain('Sonarr 4.1.0'));
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Sonarr 4.1.0'))!
      .trigger('click');
    expect(wrapper.get('[role="dialog"]').text()).toContain('Improvements');
    wrapper.unmount();
  });

  it('starts an asynchronous refresh and polls while it is running', async () => {
    vi.useFakeTimers();
    const running = { ...idleRefresh, state: 'running' as const, scope: 'all' as const };
    fetchMock
      .mockResolvedValueOnce(listResponse([summary()]))
      .mockResolvedValueOnce(response({ data: running }))
      .mockResolvedValueOnce(listResponse([summary()], idleRefresh));
    const wrapper = mount(App, { global });
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Refresh')!
      .trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Checking…');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/refresh', { method: 'POST' });

    await vi.advanceTimersByTimeAsync(1500);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      wrapper.findAll('[role="status"]').some((node) => node.text().includes('background')),
    ).toBe(false);
    wrapper.unmount();
  });

  it('updates a repository and keeps the new pending summary in the dashboard', async () => {
    const updated = summary({ githubRepo: 'custom/sonarr', dataState: 'pending' });
    fetchMock.mockResolvedValueOnce(listResponse([summary()])).mockResolvedValueOnce(
      response({
        data: updated,
        meta: {
          refresh: {
            ...idleRefresh,
            state: 'running',
            scope: 'container',
            containerId: updated.id,
          },
        },
      }),
    );
    const wrapper = mount(App, { global });
    await flushPromises();
    await wrapper.get('[aria-label="Edit repository for sonarr"]').trigger('click');
    await wrapper.get('#github-repository').setValue('custom/sonarr');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Save')!
      .trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/containers/docker-compose.yml%3A%3Asonarr/repository',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ repo: 'custom/sonarr' }) }),
    );
    expect(wrapper.text()).toContain('custom/sonarr');
    expect(wrapper.text()).toContain('pending data');
    wrapper.unmount();
  });

  it('surfaces low GitHub rate limits and refresh failures without dropping cached data', async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        data: [summary({ dataState: 'stale' })],
        meta: meta({
          refresh: {
            ...idleRefresh,
            state: 'failed',
            error: { code: 'REFRESH_FAILED', message: 'GitHub unavailable' },
          },
          githubRateLimit: {
            limit: 60,
            remaining: 2,
            resetAt: '2026-07-13T13:00:00.000Z',
            observedAt: '2026-07-13T12:00:00.000Z',
          },
        }),
      }),
    );
    const wrapper = mount(App, { global });
    await flushPromises();
    expect(wrapper.text()).toContain('Refresh failed: GitHub unavailable');
    expect(wrapper.text()).toContain('2 of 60 requests remaining');
    expect(wrapper.text()).toContain('sonarr');
    wrapper.unmount();
  });
});
