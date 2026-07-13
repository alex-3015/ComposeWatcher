import { computed, onScopeDispose, ref } from 'vue';
import { getContainers, saveRepository, startRefresh } from '../api';
import type { ContainersMeta, ContainerSummary, RefreshMeta } from '../types';

const EMPTY_REFRESH: RefreshMeta = {
  state: 'idle',
  scope: null,
  containerId: null,
  startedAt: null,
  finishedAt: null,
  error: null,
};

const EMPTY_META: ContainersMeta = {
  refresh: EMPTY_REFRESH,
  refreshedAt: null,
  githubRateLimit: null,
};

export function useContainers() {
  const containers = ref<ContainerSummary[]>([]);
  const meta = ref<ContainersMeta>({ ...EMPTY_META, refresh: { ...EMPTY_REFRESH } });
  const loading = ref(true);
  const error = ref<string | null>(null);
  const refreshError = ref<string | null>(null);
  let controller: AbortController | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let requestInFlight: Promise<void> | null = null;

  function schedulePoll(): void {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => void fetchContainers(), 1500);
  }

  async function fetchContainers(): Promise<void> {
    if (requestInFlight) return requestInFlight;
    controller?.abort();
    controller = new AbortController();
    const requestController = controller;
    if (containers.value.length === 0) loading.value = true;

    const run = (async () => {
      try {
        const response = await getContainers(requestController.signal);
        if (requestController !== controller) return;
        containers.value = response.data;
        meta.value = response.meta;
        refreshError.value = response.meta.refresh.error?.message ?? null;
        error.value = null;
        if (response.meta.refresh.state === 'running') schedulePoll();
      } catch (caught) {
        if (requestController.signal.aborted || requestController !== controller) return;
        const message = caught instanceof Error ? caught.message : 'Unknown error';
        if (containers.value.length > 0) refreshError.value = message;
        else error.value = message;
      } finally {
        if (requestController === controller) loading.value = false;
      }
    })();
    requestInFlight = run;
    try {
      await run;
    } finally {
      if (requestInFlight === run) requestInFlight = null;
    }
  }

  async function refreshContainers(): Promise<void> {
    refreshError.value = null;
    try {
      const response = await startRefresh();
      meta.value = { ...meta.value, refresh: response.data };
      schedulePoll();
    } catch (caught) {
      refreshError.value = caught instanceof Error ? caught.message : 'Unknown error';
    }
  }

  async function updateRepository(containerId: string, repo: string | null): Promise<void> {
    const response = await saveRepository(containerId, repo);
    containers.value = containers.value.map((container) =>
      container.id === containerId ? response.data : container,
    );
    meta.value = { ...meta.value, refresh: response.meta.refresh };
    if (response.meta.refresh.state === 'running') schedulePoll();
  }

  onScopeDispose(() => {
    controller?.abort();
    if (pollTimer) clearTimeout(pollTimer);
  });

  return {
    containers,
    meta,
    loading,
    error,
    refreshError,
    refreshing: computed(() => meta.value.refresh.state === 'running'),
    fetchContainers,
    refreshContainers,
    updateRepository,
  };
}
