import { computed, onScopeDispose, ref } from 'vue';
import { getContainers, saveRepository } from '../api';
import type { ContainersMeta, ContainerInfo } from '../types';

const EMPTY_META: ContainersMeta = {
  stale: false,
  refreshing: false,
  refreshedAt: null,
  refreshError: null,
};

export function useContainers() {
  const containers = ref<ContainerInfo[]>([]);
  const meta = ref<ContainersMeta>({ ...EMPTY_META });
  const loading = ref(true);
  const refreshing = ref(false);
  const error = ref<string | null>(null);
  const refreshError = ref<string | null>(null);
  let controller: AbortController | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  function schedulePoll(): void {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => void fetchContainers(false), 1500);
  }

  async function fetchContainers(forceRefresh = false): Promise<void> {
    controller?.abort();
    controller = new AbortController();
    const requestController = controller;
    if (forceRefresh) {
      refreshing.value = true;
      refreshError.value = null;
    } else if (containers.value.length === 0) {
      loading.value = true;
      error.value = null;
    }

    try {
      const response = await getContainers(forceRefresh, requestController.signal);
      if (requestController !== controller) return;
      containers.value = response.data;
      meta.value = response.meta;
      refreshError.value = response.meta.refreshError?.message ?? null;
      if (response.meta.refreshing) schedulePoll();
    } catch (caught) {
      if (requestController.signal.aborted || requestController !== controller) return;
      const message = caught instanceof Error ? caught.message : 'Unknown error';
      if (forceRefresh || containers.value.length > 0) refreshError.value = message;
      else error.value = message;
    } finally {
      if (requestController === controller) {
        loading.value = false;
        refreshing.value = false;
      }
    }
  }

  async function updateRepository(containerId: string, repo: string | null): Promise<void> {
    await saveRepository(containerId, repo);
    await fetchContainers(true);
  }

  onScopeDispose(() => {
    controller?.abort();
    if (pollTimer) clearTimeout(pollTimer);
  });

  return {
    containers,
    meta,
    loading,
    refreshing,
    error,
    refreshError,
    isRevalidating: computed(() => meta.value.refreshing && !refreshing.value),
    fetchContainers,
    updateRepository,
  };
}
