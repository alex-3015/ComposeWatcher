<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  RefreshCw,
  Container,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Search,
} from 'lucide-vue-next';
import type { ContainerInfo } from './types';
import ComposeGroup from './components/ComposeGroup.vue';
import RepoModal from './components/RepoModal.vue';
import StatCard from './components/StatCard.vue';
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
const searchQuery = ref('');
const modalContainer = ref<ContainerInfo | null>(null);
const saveError = ref<string | null>(null);
const collapsedGroups = ref<Set<string>>(new Set());

// Tracks the latest request ID to discard stale responses
let currentRequest = 0;

let staleRetryScheduled = false;

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

    // Auto-refresh once when backend returns stale (disk-cached) data
    if (
      res.headers.get('X-Data-Stale') === 'true' &&
      !forceRefresh &&
      !staleRetryScheduled
    ) {
      staleRetryScheduled = true;
      setTimeout(() => {
        staleRetryScheduled = false;
        fetchContainers(false);
      }, 3000);
    }
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
  saveError.value = null;
  try {
    const res = await fetch(`/api/containers/${encodeURIComponent(containerId)}/repo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo }),
    });
    if (!res.ok) throw new Error('Save failed');
    modalContainer.value = null;
    await fetchContainers(true);
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Unknown error';
  }
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
  unknown: 4,
};

const filtered = computed(() => {
  let list =
    filter.value === 'all'
      ? containers.value
      : containers.value.filter((c) => c.status === filter.value);

  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (c) => c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q),
    );
  }

  return [...list].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
});

const grouped = computed(() => {
  const map = new Map<string, ContainerInfo[]>();
  for (const c of filtered.value) {
    const group = map.get(c.composeFile);
    if (group) {
      group.push(c);
    } else {
      map.set(c.composeFile, [c]);
    }
  }

  return [...map.entries()]
    .map(([composeFile, items]) => ({
      composeFile,
      containers: items,
      counts: {
        breaking: items.filter((c) => c.status === 'breaking-change').length,
        updates: items.filter((c) => c.status === 'update-available').length,
        total: items.length,
      },
    }))
    .sort((a, b) => {
      const aUrgent = a.counts.breaking + a.counts.updates;
      const bUrgent = b.counts.breaking + b.counts.updates;
      if (aUrgent !== bUrgent) return bUrgent - aUrgent;
      return a.composeFile.localeCompare(b.composeFile);
    });
});

function toggleGroup(composeFile: string) {
  const s = new Set(collapsedGroups.value);
  if (s.has(composeFile)) {
    s.delete(composeFile);
  } else {
    s.add(composeFile);
  }
  collapsedGroups.value = s;
}

onMounted(() => fetchContainers());
</script>

<template>
  <div :class="`min-h-screen ${UI.pageBg} text-gray-100`">
    <!-- Header -->
    <header
      :class="`border-b ${UI.borderDefault} bg-gray-900/50 sticky top-0 z-10 backdrop-blur-sm`"
    >
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-blue-600/20 rounded-lg">
            <Container :size="20" :class="UI.primaryText" />
          </div>
          <div>
            <h1 :class="`text-base font-semibold ${UI.textPrimary} leading-none`">
              Compose Watcher
            </h1>
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
        <button
          :class="`${UI.errorText} ${UI.errorTextHover} text-sm shrink-0`"
          @click="refreshError = null"
        >
          Dismiss
        </button>
      </div>

      <!-- Stats -->
      <div
        v-if="!loading && containers.length > 0"
        class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
      >
        <StatCard
          :icon="AlertCircle"
          :count="counts.breaking"
          label="Breaking"
          :bg-class="STATUS_THEME['breaking-change'].bg"
          :border-class="STATUS_THEME['breaking-change'].border"
          :text-class="STATUS_THEME['breaking-change'].text"
        />
        <StatCard
          :icon="AlertTriangle"
          :count="counts.updates"
          label="Updates"
          :bg-class="STATUS_THEME['update-available'].bg"
          :border-class="STATUS_THEME['update-available'].border"
          :text-class="STATUS_THEME['update-available'].text"
        />
        <StatCard
          :icon="CheckCircle"
          :count="counts.ok"
          label="Up to date"
          :bg-class="STATUS_THEME['up-to-date'].bg"
          :border-class="STATUS_THEME['up-to-date'].border"
          :text-class="STATUS_THEME['up-to-date'].text"
        />
        <StatCard
          :icon="HelpCircle"
          :count="counts.noRepo"
          label="No repo"
          :bg-class="STATUS_THEME['no-repo'].bg"
          :border-class="STATUS_THEME['no-repo'].border"
          :text-class="STATUS_THEME['no-repo'].text"
        />
      </div>

      <!-- Search -->
      <div v-if="!loading && containers.length > 0" class="mb-4">
        <div class="relative">
          <Search :size="16" :class="`absolute left-3 top-1/2 -translate-y-1/2 ${UI.textMuted}`" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search containers..."
            :class="`w-full pl-10 pr-4 py-2 rounded-lg text-sm ${UI.inputBg} border ${UI.borderInput} ${UI.textPrimary} placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-colors`"
          />
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
        <button
          :class="`mt-4 text-sm ${UI.errorText} ${UI.errorTextHover} underline`"
          @click="fetchContainers()"
        >
          Try again
        </button>
      </div>

      <!-- Empty state -->
      <div v-else-if="containers.length === 0" :class="`text-center py-24 ${UI.textMuted}`">
        <Container :size="40" class="mx-auto mb-3 opacity-30" />
        <p>No containers found.</p>
        <p class="text-sm mt-1">
          Make sure the /docker directory is mounted and contains docker-compose files.
        </p>
      </div>

      <!-- No filter/search match -->
      <div v-else-if="filtered.length === 0" :class="`text-center py-16 ${UI.textMuted}`">
        {{
          searchQuery.trim()
            ? 'No containers match your search.'
            : 'No containers match this filter.'
        }}
      </div>

      <!-- Grouped container grid -->
      <div v-else>
        <ComposeGroup
          v-for="group in grouped"
          :key="group.composeFile"
          :compose-file="group.composeFile"
          :containers="group.containers"
          :counts="group.counts"
          :expanded="!collapsedGroups.has(group.composeFile)"
          @toggle="toggleGroup(group.composeFile)"
          @link-repo="modalContainer = $event"
        />
      </div>
    </main>

    <!-- Repo modal -->
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
  </div>
</template>
