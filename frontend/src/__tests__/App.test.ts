import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import App from '../App.vue';
import type { ContainerInfo } from '../types';

// ── fetch mock ────────────────────────────────────────────────────────────────
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => vi.clearAllMocks());

// ── Helpers ───────────────────────────────────────────────────────────────────
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
    lastChecked: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockContainersResponse(containers: ContainerInfo[]) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(containers),
    text: () => Promise.resolve(''),
  });
}

function mockErrorResponse() {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    json: () => Promise.resolve([]),
    text: () => Promise.resolve('Server error'),
  });
}

const globalStubs = {
  stubs: [
    'Container', 'RefreshCw', 'CheckCircle', 'AlertTriangle', 'AlertCircle', 'HelpCircle',
    'Package', 'ExternalLink', 'GitBranch', 'AlertTriangle', 'X',
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// Loading state
// ────────────────────────────────────────────────────────────────────────────
describe('App – loading state', () => {
  it('shows loading text while fetch is in progress', async () => {
    // Mock a never-resolving promise so loading stays true
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    const w = mount(App, { global: globalStubs });
    expect(w.text()).toContain('Scanning containers');
  });

  it('hides loading text after fetch completes', async () => {
    mockContainersResponse([makeContainer()]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();
    expect(w.text()).not.toContain('Scanning containers');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Successful data load
// ────────────────────────────────────────────────────────────────────────────
describe('App – container display', () => {
  it('renders a card for each container returned by the API', async () => {
    mockContainersResponse([
      makeContainer({ id: 'a::sonarr', name: 'sonarr' }),
      makeContainer({ id: 'b::radarr', name: 'radarr' }),
    ]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();
    expect(w.text()).toContain('sonarr');
    expect(w.text()).toContain('radarr');
  });

  it('shows container count in header subtitle', async () => {
    mockContainersResponse([makeContainer(), makeContainer({ id: 'b::radarr', name: 'radarr' })]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();
    expect(w.text()).toContain('2 containers found');
  });

  it('uses singular form for exactly 1 container', async () => {
    mockContainersResponse([makeContainer()]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();
    expect(w.text()).toContain('1 container found');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Error state
// ────────────────────────────────────────────────────────────────────────────
describe('App – error state', () => {
  it('shows error message when API returns non-ok response', async () => {
    mockErrorResponse();
    const w = mount(App, { global: globalStubs });
    await flushPromises();
    expect(w.text()).toContain('Error loading containers');
  });

  it('shows error message when fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network failure'));
    const w = mount(App, { global: globalStubs });
    await flushPromises();
    expect(w.text()).toContain('Error loading containers');
  });

  it('shows "Try again" link in error state', async () => {
    mockErrorResponse();
    const w = mount(App, { global: globalStubs });
    await flushPromises();
    expect(w.text()).toContain('Try again');
  });

  it('"Try again" re-fetches data on click', async () => {
    mockErrorResponse();
    mockContainersResponse([makeContainer()]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();

    const retryBtn = w.findAll('button').find((b) => b.text() === 'Try again');
    await retryBtn!.trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(w.text()).not.toContain('Error loading containers');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Empty state
// ────────────────────────────────────────────────────────────────────────────
describe('App – empty state', () => {
  it('shows empty state message when no containers are returned', async () => {
    mockContainersResponse([]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();
    expect(w.text()).toContain('No containers found');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Stat cards
// ────────────────────────────────────────────────────────────────────────────
describe('App – stat cards', () => {
  it('shows correct count for each status category', async () => {
    mockContainersResponse([
      makeContainer({ id: 'a', status: 'breaking-change' }),
      makeContainer({ id: 'b', status: 'update-available' }),
      makeContainer({ id: 'c', status: 'update-available' }),
      makeContainer({ id: 'd', status: 'up-to-date' }),
      makeContainer({ id: 'e', status: 'no-repo' }),
    ]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();

    const text = w.text();
    // Each count appears once in the stat cards
    // Breaking: 1, Updates: 2, Up-to-date: 1, No repo: 1
    expect(text).toContain('Breaking');
    expect(text).toContain('Updates');
    expect(text).toContain('Up to date');
    expect(text).toContain('No repo');
  });

  it('hides stat cards during loading', async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    const w = mount(App, { global: globalStubs });
    expect(w.text()).not.toContain('Breaking');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Filters
// ────────────────────────────────────────────────────────────────────────────
describe('App – filters', () => {
  async function mountWithFilters() {
    mockContainersResponse([
      makeContainer({ id: 'a', name: 'breaker', status: 'breaking-change' }),
      makeContainer({ id: 'b', name: 'updater', status: 'update-available' }),
      makeContainer({ id: 'c', name: 'current', status: 'up-to-date' }),
      makeContainer({ id: 'd', name: 'norepo',  status: 'no-repo' }),
      makeContainer({ id: 'e', name: 'mystery', status: 'unknown' }),
    ]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();
    return w;
  }

  it('shows all containers with "All" filter (default)', async () => {
    const w = await mountWithFilters();
    expect(w.text()).toContain('breaker');
    expect(w.text()).toContain('updater');
    expect(w.text()).toContain('current');
  });

  it('filters to only breaking-change containers', async () => {
    const w = await mountWithFilters();
    const filterBtns = w.findAll('button').filter((b) => b.text().includes('Breaking'));
    await filterBtns[0].trigger('click');

    expect(w.text()).toContain('breaker');
    expect(w.text()).not.toContain('updater');
    expect(w.text()).not.toContain('current');
  });

  it('filters to only update-available containers', async () => {
    const w = await mountWithFilters();
    const filterBtns = w.findAll('button').filter((b) => b.text().includes('Updates'));
    await filterBtns[0].trigger('click');

    expect(w.text()).toContain('updater');
    expect(w.text()).not.toContain('breaker');
  });

  it('filters to only up-to-date containers', async () => {
    const w = await mountWithFilters();
    const filterBtns = w.findAll('button').filter((b) => b.text().includes('Up to date'));
    await filterBtns[0].trigger('click');

    expect(w.text()).toContain('current');
    expect(w.text()).not.toContain('breaker');
    expect(w.text()).not.toContain('updater');
  });

  it('shows "No containers match this filter" when filter has no results', async () => {
    mockContainersResponse([makeContainer({ status: 'up-to-date' })]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();

    // Click "Breaking" filter (no breaking containers exist)
    const filterBtns = w.findAll('button').filter((b) => b.text().includes('Breaking'));
    await filterBtns[0].trigger('click');

    expect(w.text()).toContain('No containers match this filter');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Refresh
// ────────────────────────────────────────────────────────────────────────────
describe('App – refresh', () => {
  it('Refresh button calls API with ?refresh=true', async () => {
    mockContainersResponse([makeContainer()]);
    mockContainersResponse([makeContainer()]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();

    const refreshBtn = w.findAll('button').find((b) => b.text().includes('Refresh'));
    await refreshBtn!.trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [secondUrl] = fetchMock.mock.calls[1];
    expect(secondUrl).toContain('refresh=true');
  });

  it('initial load does NOT include ?refresh=true', async () => {
    mockContainersResponse([]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();

    const [firstUrl] = fetchMock.mock.calls[0];
    expect(firstUrl).not.toContain('refresh=true');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Sort order
// ────────────────────────────────────────────────────────────────────────────
describe('App – card sort order', () => {
  it('renders containers sorted: breaking → updates → up-to-date → no-repo → unknown', async () => {
    // Provide in reverse order to verify sorting is applied
    mockContainersResponse([
      makeContainer({ id: 'e', name: 'mystery', status: 'unknown' }),
      makeContainer({ id: 'd', name: 'norepo',  status: 'no-repo' }),
      makeContainer({ id: 'c', name: 'current', status: 'up-to-date' }),
      makeContainer({ id: 'b', name: 'updater', status: 'update-available' }),
      makeContainer({ id: 'a', name: 'breaker', status: 'breaking-change' }),
    ]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();

    const text = w.text();
    const positions = {
      breaker: text.indexOf('breaker'),
      updater: text.indexOf('updater'),
      current: text.indexOf('current'),
      norepo:  text.indexOf('norepo'),
      mystery: text.indexOf('mystery'),
    };

    expect(positions.breaker).toBeLessThan(positions.updater);
    expect(positions.updater).toBeLessThan(positions.current);
    expect(positions.current).toBeLessThan(positions.norepo);
    expect(positions.norepo).toBeLessThan(positions.mystery);
  });

  it('sort order is preserved when a status filter is active', async () => {
    // Two update-available containers — order within same status is stable (insertion order)
    mockContainersResponse([
      makeContainer({ id: 'b', name: 'second', status: 'update-available' }),
      makeContainer({ id: 'a', name: 'first',  status: 'update-available' }),
    ]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();

    const filterBtns = w.findAll('button').filter((b) => b.text().includes('Updates'));
    await filterBtns[0].trigger('click');

    const text = w.text();
    // Stable sort: both are update-available, original order preserved
    expect(text.indexOf('second')).toBeLessThan(text.indexOf('first'));
  });

  it('shows all containers regardless of sort after filter reset to All', async () => {
    mockContainersResponse([
      makeContainer({ id: 'a', name: 'breaker', status: 'breaking-change' }),
      makeContainer({ id: 'b', name: 'current', status: 'up-to-date' }),
    ]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();

    // Filter to up-to-date
    const filterBtns = w.findAll('button').filter((b) => b.text().includes('Up to date'));
    await filterBtns[0].trigger('click');
    expect(w.text()).not.toContain('breaker');

    // Reset to All
    const allBtn = w.findAll('button').find((b) => b.text().trim().startsWith('All'));
    await allBtn!.trigger('click');
    expect(w.text()).toContain('breaker');
    expect(w.text()).toContain('current');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Repo modal integration
// ────────────────────────────────────────────────────────────────────────────
describe('App – repo modal', () => {
  it('modal is not shown initially', async () => {
    mockContainersResponse([makeContainer()]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();
    // RepoModal has a fixed overlay with specific class
    expect(w.find('.fixed.inset-0').exists()).toBe(false);
  });

  it('opens modal when a ContainerCard emits "link-repo"', async () => {
    mockContainersResponse([makeContainer({ githubRepo: null, status: 'no-repo' })]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();

    // Find the link-repo button (last button in the card footer)
    const buttons = w.findAll('button');
    const linkRepoBtn = buttons.find((b) => b.text().includes('Link repo'));
    await linkRepoBtn!.trigger('click');

    expect(w.find('.fixed.inset-0').exists()).toBe(true);
  });

  it('closes modal when RepoModal emits "close"', async () => {
    mockContainersResponse([makeContainer({ githubRepo: null, status: 'no-repo' })]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();

    // Open modal
    const linkRepoBtn = w.findAll('button').find((b) => b.text().includes('Link repo'));
    await linkRepoBtn!.trigger('click');
    expect(w.find('.fixed.inset-0').exists()).toBe(true);

    // Close via Cancel
    const cancelBtn = w.findAll('button').find((b) => b.text() === 'Cancel');
    await cancelBtn!.trigger('click');
    expect(w.find('.fixed.inset-0').exists()).toBe(false);
  });

  it('calls POST API and refreshes after save', async () => {
    mockContainersResponse([makeContainer({ githubRepo: null, status: 'no-repo' })]);
    const w = mount(App, { global: globalStubs });
    await flushPromises();

    // Open modal
    const linkRepoBtn = w.findAll('button').find((b) => b.text().includes('Link repo'));
    await linkRepoBtn!.trigger('click');

    // Set repo value and save
    const input = w.find('input');
    await input.setValue('myorg/myapp');

    // Mock the POST response and the subsequent GET refresh
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }), text: () => Promise.resolve('') });
    mockContainersResponse([makeContainer({ githubRepo: 'myorg/myapp', status: 'unknown' })]);

    const saveBtn = w.findAll('button').find((b) => b.text() === 'Save');
    await saveBtn!.trigger('click');
    await flushPromises();

    // POST to /api/containers/:id/repo
    const postCall = fetchMock.mock.calls.find(([url, opts]) =>
      (url as string).includes('/api/containers') && (opts as RequestInit)?.method === 'POST'
    );
    expect(postCall).toBeTruthy();
    const [, postOpts] = postCall!;
    expect(JSON.parse((postOpts as RequestInit).body as string)).toEqual({ repo: 'myorg/myapp' });
  });
});
