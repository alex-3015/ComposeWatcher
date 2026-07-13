import { effectScope } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useContainerDetail } from '../composables/useContainerDetail';
import { detail, summary } from './factories';

const api = vi.hoisted(() => ({ getContainerDetail: vi.fn() }));
vi.mock('../api', () => api);

beforeEach(() => vi.clearAllMocks());

function subject() {
  const scope = effectScope();
  const state = scope.run(() => useContainerDetail())!;
  return { scope, state };
}

describe('useContainerDetail', () => {
  it('loads and caches detail by container check time', async () => {
    api.getContainerDetail.mockResolvedValueOnce({ data: detail() });
    const { scope, state } = subject();
    const container = summary();
    await state.load(container);
    await state.load(container);
    expect(state.detail.value?.releaseNotes).toContain('Improvements');
    expect(api.getContainerDetail).toHaveBeenCalledOnce();
    scope.stop();
  });

  it('reloads detail after a newer container check', async () => {
    api.getContainerDetail
      .mockResolvedValueOnce({ data: detail() })
      .mockResolvedValueOnce({ data: detail({ releaseNotes: 'New notes' }) });
    const { scope, state } = subject();
    await state.load(summary());
    await state.load(summary({ lastChecked: '2026-07-13T13:00:00.000Z' }));
    expect(state.detail.value?.releaseNotes).toBe('New notes');
    expect(api.getContainerDetail).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it('reports request errors and ignores non-Error values', async () => {
    api.getContainerDetail.mockRejectedValueOnce('Offline');
    const { scope, state } = subject();
    await state.load(summary());
    expect(state.error.value).toBe('Unknown error');
    expect(state.loading.value).toBe(false);
    scope.stop();
  });

  it('aborts an older selection and ignores its late result', async () => {
    let resolve!: (value: { data: ReturnType<typeof detail> }) => void;
    api.getContainerDetail
      .mockImplementationOnce(
        (_id: string, signal: AbortSignal) =>
          new Promise((done) => {
            resolve = done;
            signal.addEventListener('abort', () => undefined);
          }),
      )
      .mockResolvedValueOnce({ data: detail({ id: 'compose.yml::new', name: 'new' }) });
    const { scope, state } = subject();
    const first = state.load(summary());
    await state.load(summary({ id: 'compose.yml::new', name: 'new' }));
    resolve({ data: detail() });
    await first;
    expect(state.detail.value?.name).toBe('new');
    scope.stop();
  });

  it('clears state and aborts the current request', async () => {
    api.getContainerDetail.mockImplementationOnce(
      (_id: string, signal: AbortSignal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
        ),
    );
    const { scope, state } = subject();
    const request = state.load(summary());
    state.clear();
    await request;
    expect(state.detail.value).toBeNull();
    expect(state.loading.value).toBe(false);
    scope.stop();
  });
});
