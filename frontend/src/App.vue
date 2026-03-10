<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { RefreshCw, Container, CheckCircle, AlertTriangle, AlertCircle, HelpCircle } from 'lucide-vue-next';
import type { ContainerInfo } from './types';
import ContainerCard from './components/ContainerCard.vue';
import RepoModal from './components/RepoModal.vue';
import { STATUS_THEME, UI } from './theme';

type FilterStatus = 'all' | ContainerInfo['status'];

const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'breaking-change', label: 'Breaking' },
  { value: 'update-available', label: 'Updates' },
  { value: 'up-to-date', label: 'Up to date' },
  { value: 'no-repo', label: 'No repo' },
  { value: 'unknown', label: 'Unknown' },
];

const containers = ref<ContainerInfo[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const error = ref<string | null>(null);
const refreshError = ref<string | null>(null);
const filter = ref<FilterStatus>('all');
const modalContainer = ref<ContainerInfo | null>(null);

let currentRequest = 0;

async function fetchContainers(forceRefresh = false) {
  const reqId = ++currentRequest;
  try {
    if (forceRefresh) {
      refreshing.value = true;
      refreshError.value = null;
    } else {
      loading.value = true;
      error.value = null;
    }
    const url = `/api/containers${forceRefresh ? '?refresh=true' : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: ContainerInfo[] = await res.json();
    if (reqId === currentRequest) containers.value = data;
  } catch (e) {
    if (reqId !== currentRequest) return;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    if (forceRefresh) {
      refreshError.value = msg;
    } else {
      error.value = msg;
    }
  } finally {
    if (reqId === currentRequest) {
      loading.value = false;
      refreshing.value = false;
    }
  }
}

async function handleSaveRepo(containerId: string, repo: string | null) {
  const res = await fetch(`/api/containers/${encodeURIComponent(containerId)}/repo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo }),
  });
  if (!res.ok) throw new Error('Save failed');
  modalContainer.value = null;
  await fetchContainers(true);
}

function countForStatus(status: FilterStatus): number {
  if (status === 'all') return containers.value.length;
  return containers.value.filter((c) => c.status === status).length;
}

const counts = computed(() => ({
  breaking: countForStatus('breaking-change'),
  updates: countForStatus('update-available'),
  ok: countForStatus('up-to-date'),
  noRepo: countForStatus('no-repo'),
}));

const STATUS_ORDER: Record<ContainerInfo['status'], number> = {
  'breaking-change': 0,
  'update-available': 1,
  'up-to-date': 2,
  'no-repo': 3,
  'unknown': 4,
};

const filtered = computed(() => {
  const list =
    filter.value === 'all'
      ? containers.value
      : containers.value.filter((c) => c.status === filter.value);
  return [...list].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
});

onMounted(() => fetchContainers());
</script>

<template>
  <div :class="`min-h-screen ${UI.pageBg} text-gray-100`">
    <!-- Header -->
    <header :class="`border-b ${UI.borderDefault} bg-gray-900/50 sticky top-0 z-10 backdrop-blur-sm`">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-blue-600/20 rounded-lg">
            <Container :size="20" :class="UI.primaryText" />
          </div>
          <div>
            <h1 :class="`text-base font-semibold ${UI.textPrimary} leading-none`">Compose Watcher</h1>
            <p :class="`${UI.textMuted} text-xs mt-0.5`">
              {{ containers.length }} container{{ containers.length !== 1 ? 's' : '' }} found
            </p>
          </div>
        </div>
        <button
          :disabled="refreshing"
          :class="`flex items-center gap-2 ${UI.inputBg} hover:bg-gray-700 disabled:opacity-50 border ${UI.borderSubtle} rounded-lg px-3 py-2 text-sm text-gray-300 transition-colors`"
          @click="fetchContainers(true)"
        >
          <RefreshCw :size="14" :class="refreshing ? 'animate-spin' : ''" />
          {{ refreshing ? 'Checking…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <!-- Refresh error banner (keeps existing containers visible) -->
      <div
        v-if="refreshError"
        :class="`${UI.errorBg} border ${UI.errorBorder} rounded-xl px-4 py-3 mb-5 flex items-center justify-between gap-4`"
      >
        <p :class="`${UI.errorText} text-sm`">Refresh failed: {{ refreshError }}</p>
        <button :class="`${UI.errorText} ${UI.errorTextHover} text-sm shrink-0`" @click="refreshError = null">Dismiss</button>
      </div>

      <!-- Stats -->
      <div v-if="!loading && containers.length > 0" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div :class="`${STATUS_THEME['breaking-change'].bg} border ${STATUS_THEME['breaking-change'].border} rounded-xl px-4 py-3 flex items-center gap-3`">
          <AlertCircle :size="16" :class="`${STATUS_THEME['breaking-change'].text} shrink-0`" />
          <div>
            <p :class="`${UI.textPrimary} text-xl font-bold leading-none`">{{ counts.breaking }}</p>
            <p :class="`${UI.textMuted} text-xs mt-0.5`">Breaking</p>
          </div>
        </div>
        <div :class="`${STATUS_THEME['update-available'].bg} border ${STATUS_THEME['update-available'].border} rounded-xl px-4 py-3 flex items-center gap-3`">
          <AlertTriangle :size="16" :class="`${STATUS_THEME['update-available'].text} shrink-0`" />
          <div>
            <p :class="`${UI.textPrimary} text-xl font-bold leading-none`">{{ counts.updates }}</p>
            <p :class="`${UI.textMuted} text-xs mt-0.5`">Updates</p>
          </div>
        </div>
        <div :class="`${STATUS_THEME['up-to-date'].bg} border ${STATUS_THEME['up-to-date'].border} rounded-xl px-4 py-3 flex items-center gap-3`">
          <CheckCircle :size="16" :class="`${STATUS_THEME['up-to-date'].text} shrink-0`" />
          <div>
            <p :class="`${UI.textPrimary} text-xl font-bold leading-none`">{{ counts.ok }}</p>
            <p :class="`${UI.textMuted} text-xs mt-0.5`">Up to date</p>
          </div>
        </div>
        <div :class="`${STATUS_THEME['no-repo'].bg} border ${STATUS_THEME['no-repo'].border} rounded-xl px-4 py-3 flex items-center gap-3`">
          <HelpCircle :size="16" :class="`${STATUS_THEME['no-repo'].text} shrink-0`" />
          <div>
            <p :class="`${UI.textPrimary} text-xl font-bold leading-none`">{{ counts.noRepo }}</p>
            <p :class="`${UI.textMuted} text-xs mt-0.5`">No repo</p>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div v-if="!loading && containers.length > 0" class="flex flex-wrap gap-2 mb-5">
        <button
          v-for="opt in FILTER_OPTIONS"
          :key="opt.value"
          :class="[
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            filter === opt.value
              ? `${UI.primaryBg} ${UI.textPrimary}`
              : `${UI.inputBg} ${UI.textSecondary} hover:text-gray-200 border ${UI.borderSubtle}`,
          ]"
          @click="filter = opt.value"
        >
          {{ opt.label }}
          <span v-if="opt.value !== 'all'" class="ml-1.5 opacity-60">
            {{ countForStatus(opt.value) }}
          </span>
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" :class="`flex items-center justify-center py-24 ${UI.textMuted}`">
        <RefreshCw :size="20" class="animate-spin mr-2" />
        Scanning containers…
      </div>

      <!-- Error (initial load only – containers not yet available) -->
      <div
        v-else-if="error && containers.length === 0"
        :class="`${UI.errorBg} border ${UI.errorBorder} rounded-xl p-6 text-center`"
      >
        <p :class="`${UI.errorText} font-medium`">Error loading containers</p>
        <p class="text-red-300/70 text-sm mt-1">{{ error }}</p>
        <button :class="`mt-4 text-sm ${UI.errorText} ${UI.errorTextHover} underline`" @click="fetchContainers()">
          Try again
        </button>
      </div>

      <!-- Empty state -->
      <div v-else-if="containers.length === 0" :class="`text-center py-24 ${UI.textMuted}`">
        <Container :size="40" class="mx-auto mb-3 opacity-30" />
        <p>No containers found.</p>
        <p class="text-sm mt-1">Make sure the /docker directory is mounted and contains docker-compose files.</p>
      </div>

      <!-- No filter match -->
      <div v-else-if="filtered.length === 0" :class="`text-center py-16 ${UI.textMuted}`">
        No containers match this filter.
      </div>

      <!-- Container grid -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <ContainerCard
          v-for="c in filtered"
          :key="c.id"
          :container="c"
          @link-repo="modalContainer = $event"
        />
      </div>
    </main>

    <!-- Repo modal -->
    <RepoModal
      v-if="modalContainer"
      :container="modalContainer"
      @close="modalContainer = null"
      @save="handleSaveRepo"
    />
  </div>
</template>
