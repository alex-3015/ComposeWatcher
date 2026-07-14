<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RefreshCw } from '@lucide/vue';
import type { ContainerSummary } from './types';
import ComposeGroup from './components/ComposeGroup.vue';
import ContainerDetailPanel from './components/ContainerDetailPanel.vue';
import DashboardControls from './components/DashboardControls.vue';
import DashboardHeader from './components/DashboardHeader.vue';
import RepoModal from './components/RepoModal.vue';
import { useContainerDetail } from './composables/useContainerDetail';
import { useDashboardView } from './composables/useDashboardView';
import { useContainers } from './composables/useContainers';
import { UI } from './theme';
import { formatExactDate } from './format';

const AUTO_REFRESH_MS = 5 * 60 * 1000;
const {
  containers,
  meta,
  loading,
  error,
  refreshError,
  refreshing,
  fetchContainers,
  refreshContainers,
  updateRepository,
} = useContainers();
const {
  filter,
  sortMode,
  viewMode,
  searchQuery,
  collapsedGroups,
  filtered,
  grouped,
  counts,
  toggleGroup,
  setGroupsExpanded,
  loadPreferences,
} = useDashboardView(containers);
const detailState = useContainerDetail();

const modalContainer = ref<ContainerSummary | null>(null);
const selectedContainer = ref<ContainerSummary | null>(null);
const saveError = ref<string | null>(null);
let autoRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let lastFetchAt = 0;

function scheduleAutoRefresh(): void {
  if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
  if (document.visibilityState !== 'visible') return;
  const delay = Math.max(0, AUTO_REFRESH_MS - (Date.now() - lastFetchAt));
  autoRefreshTimer = setTimeout(() => void loadDashboard(), delay);
}

async function loadDashboard(): Promise<void> {
  await fetchContainers();
  lastFetchAt = Date.now();
  scheduleAutoRefresh();
}

function handleVisibilityChange(): void {
  if (document.visibilityState !== 'visible') {
    if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
    autoRefreshTimer = null;
    return;
  }
  if (Date.now() - lastFetchAt >= AUTO_REFRESH_MS) void loadDashboard();
  else scheduleAutoRefresh();
}

function openDetail(container: ContainerSummary): void {
  selectedContainer.value = container;
  void detailState.load(container);
}

function closeDetail(): void {
  selectedContainer.value = null;
  detailState.clear();
}

async function handleSaveRepo(containerId: string, repo: string | null): Promise<void> {
  saveError.value = null;
  try {
    await updateRepository(containerId, repo);
    modalContainer.value = null;
    if (selectedContainer.value?.id === containerId) {
      const updated = containers.value.find((container) => container.id === containerId);
      if (updated) openDetail(updated);
    }
  } catch (caught) {
    saveError.value = caught instanceof Error ? caught.message : 'Unknown error';
  }
}

watch(containers, (current) => {
  if (!selectedContainer.value) return;
  const updated = current.find((container) => container.id === selectedContainer.value?.id);
  if (!updated) return closeDetail();
  if (updated.lastChecked !== selectedContainer.value.lastChecked) {
    selectedContainer.value = updated;
    void detailState.load(updated);
  }
});

onMounted(() => {
  loadPreferences();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  void loadDashboard();
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
});
</script>

<template>
  <div :class="`min-h-screen ${UI.pageBg} text-gray-100`">
    <DashboardHeader
      :container-count="containers.length"
      :compose-count="grouped.length"
      :refreshing="refreshing"
      @refresh="refreshContainers"
    />

    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div
        v-if="refreshError"
        role="alert"
        class="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
      >
        Refresh failed: {{ refreshError }}
      </div>
      <div
        v-if="meta.refresh.state === 'running'"
        role="status"
        aria-live="polite"
        :class="`${UI.inputBg} border ${UI.borderSubtle} rounded-xl px-4 py-3 mb-5 text-sm ${UI.textSecondary}`"
      >
        Checking
        {{ meta.refresh.scope === 'container' ? 'selected container' : 'GitHub releases' }} in the
        background…
      </div>
      <div
        v-if="
          meta.githubRateLimit &&
          meta.githubRateLimit.remaining <= Math.max(10, meta.githubRateLimit.limit * 0.1)
        "
        role="status"
        :class="`${UI.inputBg} border ${UI.borderSubtle} rounded-xl px-4 py-3 mb-5 text-sm ${UI.textSecondary}`"
      >
        GitHub API: {{ meta.githubRateLimit.remaining }} of
        {{ meta.githubRateLimit.limit }} requests remaining. Resets
        {{ formatExactDate(meta.githubRateLimit.resetAt) }}.
      </div>

      <DashboardControls
        v-if="!loading && containers.length"
        v-model:filter="filter"
        v-model:sort-mode="sortMode"
        v-model:view-mode="viewMode"
        v-model:search-query="searchQuery"
        :counts="counts"
      />

      <div
        v-if="loading"
        role="status"
        class="flex items-center justify-center py-24 text-gray-400"
      >
        <RefreshCw :size="20" class="animate-spin mr-2" /> Scanning containers…
      </div>
      <div
        v-else-if="error && !containers.length"
        role="alert"
        class="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-300"
      >
        <p>Error loading containers: {{ error }}</p>
        <button class="mt-3 min-h-11 rounded px-3 underline" @click="loadDashboard()">
          Try again
        </button>
      </div>
      <div v-else-if="!containers.length" class="text-center py-24 text-gray-400">
        No containers found. Mount a directory containing Compose files at <code>/docker</code>.
      </div>
      <div v-else-if="!filtered.length" class="text-center py-16 text-gray-400">
        No containers match this view.
      </div>
      <template v-else>
        <div v-if="grouped.length > 1" class="flex justify-end gap-3 mb-3">
          <button
            type="button"
            :class="`min-h-11 px-2 text-xs ${UI.textSecondary} ${UI.textHover} rounded focus:outline-none focus:ring-2 focus:ring-blue-500/60`"
            @click="
              setGroupsExpanded(
                grouped.map((group) => group.composeFile),
                true,
              )
            "
          >
            Expand all
          </button>
          <button
            type="button"
            :class="`min-h-11 px-2 text-xs ${UI.textSecondary} ${UI.textHover} rounded focus:outline-none focus:ring-2 focus:ring-blue-500/60`"
            @click="
              setGroupsExpanded(
                grouped.map((group) => group.composeFile),
                false,
              )
            "
          >
            Collapse all
          </button>
        </div>
        <ComposeGroup
          v-for="group in grouped"
          :key="group.composeFile"
          :compose-file="group.composeFile"
          :containers="group.containers"
          :counts="group.counts"
          :expanded="!collapsedGroups.has(group.composeFile)"
          :view-mode="viewMode"
          @toggle="toggleGroup(group.composeFile)"
          @link-repo="modalContainer = $event"
          @open-detail="openDetail"
        />
      </template>
    </main>

    <RepoModal
      v-if="modalContainer"
      :container="modalContainer"
      :save-error="saveError"
      @close="
        modalContainer = null;
        saveError = null;
      "
      @save="handleSaveRepo"
    />
    <ContainerDetailPanel
      v-if="selectedContainer"
      :container="selectedContainer"
      :detail="detailState.detail.value"
      :loading="detailState.loading.value"
      :error="detailState.error.value"
      @close="closeDetail"
      @retry="detailState.load"
      @edit-repository="modalContainer = $event"
    />
  </div>
</template>
