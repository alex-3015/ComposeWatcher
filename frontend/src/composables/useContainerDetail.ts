import { onScopeDispose, ref } from 'vue';
import { getContainerDetail } from '../api';
import type { ContainerDetail, ContainerSummary } from '../types';

export function useContainerDetail() {
  const detail = ref<ContainerDetail | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const cache = new Map<string, ContainerDetail>();
  let controller: AbortController | null = null;

  function cacheKey(container: ContainerSummary): string {
    return `${container.id}:${container.lastChecked ?? 'pending'}`;
  }

  async function load(container: ContainerSummary): Promise<void> {
    controller?.abort();
    const cached = cache.get(cacheKey(container));
    if (cached) {
      detail.value = cached;
      error.value = null;
      return;
    }

    controller = new AbortController();
    const requestController = controller;
    loading.value = true;
    error.value = null;
    detail.value = null;
    try {
      const response = await getContainerDetail(container.id, requestController.signal);
      if (requestController !== controller) return;
      cache.set(cacheKey(container), response.data);
      detail.value = response.data;
    } catch (caught) {
      if (requestController.signal.aborted || requestController !== controller) return;
      error.value = caught instanceof Error ? caught.message : 'Unknown error';
    } finally {
      if (requestController === controller) loading.value = false;
    }
  }

  function clear(): void {
    controller?.abort();
    controller = null;
    detail.value = null;
    error.value = null;
    loading.value = false;
  }

  onScopeDispose(clear);
  return { detail, loading, error, load, clear };
}
