import { effectScope, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContainers } from '../composables/useContainers';
import { idleRefresh, meta, summary } from './factories';

const api = vi.hoisted(() => ({
  getContainers: vi.fn(),
  saveRepository: vi.fn(),
  startRefresh: vi.fn(),
}));
vi.mock('../api', () => api);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

function subject() {
  const scope = effectScope();
  const state = scope.run(() => useContainers())!;
  return { scope, state };
}

describe('useContainers', () => {
  it('loads summaries and exposes running state', async () => {
    api.getContainers.mockResolvedValueOnce({
      data: [summary()],
      meta: meta({ refresh: { ...idleRefresh, state: 'running', scope: 'all' } }),
    });
    const { scope, state } = subject();
    await state.fetchContainers();
    expect(state.containers.value).toHaveLength(1);
    expect(state.refreshing.value).toBe(true);
    expect(state.loading.value).toBe(false);
    scope.stop();
  });

  it('coalesces overlapping list requests', async () => {
    let resolve!: (value: ReturnType<typeof list>) => void;
    const list = () => ({ data: [summary()], meta: meta() });
    api.getContainers.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    const { scope, state } = subject();
    const first = state.fetchContainers();
    const second = state.fetchContainers();
    resolve(list());
    await Promise.all([first, second]);
    expect(api.getContainers).toHaveBeenCalledOnce();
    scope.stop();
  });

  it('shows an initial load error', async () => {
    api.getContainers.mockRejectedValueOnce(new Error('Offline'));
    const { scope, state } = subject();
    await state.fetchContainers();
    expect(state.error.value).toBe('Offline');
    expect(state.refreshError.value).toBeNull();
    scope.stop();
  });

  it('keeps cached summaries and reports a later polling error', async () => {
    api.getContainers
      .mockResolvedValueOnce({ data: [summary()], meta: meta() })
      .mockRejectedValueOnce('Offline');
    const { scope, state } = subject();
    await state.fetchContainers();
    await state.fetchContainers();
    expect(state.containers.value).toHaveLength(1);
    expect(state.refreshError.value).toBe('Unknown error');
    expect(state.error.value).toBeNull();
    scope.stop();
  });

  it('starts refreshes and polls the collection', async () => {
    api.startRefresh.mockResolvedValueOnce({
      data: { ...idleRefresh, state: 'running', scope: 'all' },
    });
    api.getContainers.mockResolvedValueOnce({ data: [summary()], meta: meta() });
    const { scope, state } = subject();
    await state.refreshContainers();
    expect(state.refreshing.value).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(api.getContainers).toHaveBeenCalledOnce();
    scope.stop();
  });

  it('reports refresh start failures', async () => {
    api.startRefresh.mockRejectedValueOnce('Offline');
    const { scope, state } = subject();
    await state.refreshContainers();
    expect(state.refreshError.value).toBe('Unknown error');
    scope.stop();
  });

  it.each([
    ['idle', false],
    ['running', true],
  ] as const)(
    'updates one summary with a %s targeted refresh',
    async (refreshState, shouldPoll) => {
      const updated = summary({ githubRepo: 'custom/app' });
      api.saveRepository.mockResolvedValueOnce({
        data: updated,
        meta: {
          refresh:
            refreshState === 'running'
              ? { ...idleRefresh, state: 'running', scope: 'container', containerId: updated.id }
              : idleRefresh,
        },
      });
      api.getContainers.mockResolvedValueOnce({ data: [updated], meta: meta() });
      const { scope, state } = subject();
      state.containers.value = [summary()];
      await state.updateRepository(updated.id, 'custom/app');
      expect(state.containers.value[0].githubRepo).toBe('custom/app');
      await vi.advanceTimersByTimeAsync(1500);
      expect(api.getContainers).toHaveBeenCalledTimes(shouldPoll ? 1 : 0);
      scope.stop();
    },
  );

  it('aborts list work and polling when its scope is disposed', async () => {
    api.getContainers.mockResolvedValueOnce({
      data: [summary()],
      meta: meta({ refresh: { ...idleRefresh, state: 'running', scope: 'all' } }),
    });
    const { scope, state } = subject();
    await state.fetchContainers();
    const signal = api.getContainers.mock.calls[0][0] as AbortSignal;
    scope.stop();
    await nextTick();
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(api.getContainers).toHaveBeenCalledOnce();
  });
});
