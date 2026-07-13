<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted, watch } from 'vue';
import {
  RefreshCw,
  Container,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Search,
  TrendingUp,
  LayoutGrid,
  List,
} from '@lucide/vue';
import type { CheckIssueCode, ContainerInfo } from './types';
import ComposeGroup from './components/ComposeGroup.vue';
import RepoModal from './components/RepoModal.vue';
import StatCard from './components/StatCard.vue';
import { STATUS_THEME, UI } from './theme';
import { useContainers } from './composables/useContainers';
import { formatExactDate } from './format';

type FilterStatus = 'all' | ContainerInfo['status'];
type SortMode = 'priority' | 'name' | 'compose' | 'published';
type ViewMode = 'cards' | 'compact';

const PREFERENCES_KEY = 'compose-watcher:dashboard:v1';
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'breaking-change', label: 'Breaking' },
  { value: 'update-available', label: 'Updates' },
  { value: 'up-to-date', label: 'Up to date' },
  { value: 'ahead', label: 'Ahead' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'no-repo', label: 'No repo' },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'name', label: 'Name' },
  { value: 'compose', label: 'Compose file' },
  { value: 'published', label: 'Release date' },
];

const {
  containers,
  meta,
  loading,
  refreshing,
  error,
  refreshError,
  isRevalidating,
  fetchContainers,
  updateRepository,
} = useContainers();
const filter = ref<FilterStatus>('all');
const sortMode = ref<SortMode>('priority');
const viewMode = ref<ViewMode>('cards');
const searchQuery = ref('');
const modalContainer = ref<ContainerInfo | null>(null);
const saveError = ref<string | null>(null);
const collapsedGroups = ref<Set<string>>(new Set());
const dismissedIssues = ref<Set<CheckIssueCode>>(new Set());
let autoRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let lastFetchAt = 0;

function isFilterStatus(value: unknown): value is FilterStatus {
  return FILTER_OPTIONS.some((option) => option.value === value);
}

function isSortMode(value: unknown): value is SortMode {
  return SORT_OPTIONS.some((option) => option.value === value);
}

function loadPreferences(): void {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    if (isFilterStatus(saved.filter)) filter.value = saved.filter;
    if (isSortMode(saved.sortMode)) sortMode.value = saved.sortMode;
    if (saved.viewMode === 'cards' || saved.viewMode === 'compact') viewMode.value = saved.viewMode;
    if (Array.isArray(saved.collapsedGroups)) {
      collapsedGroups.value = new Set(
        saved.collapsedGroups.filter((value): value is string => typeof value === 'string'),
      );
    }
  } catch {
    try {
      localStorage.removeItem(PREFERENCES_KEY);
    } catch {
      // Preferences are optional; storage may be disabled by the browser.
    }
  }
}

function savePreferences(): void {
  try {
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({
        filter: filter.value,
        sortMode: sortMode.value,
        viewMode: viewMode.value,
        collapsedGroups: [...collapsedGroups.value],
      }),
    );
  } catch {
    // Dashboard behavior must not depend on browser storage availability.
  }
}

async function handleSaveRepo(containerId: string, repo: string | null) {
  saveError.value = null;
  try {
    await updateRepository(containerId, repo);
    modalContainer.value = null;
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Unknown error';
  }
}

const issueSummaries = computed(() => {
  const summaries = new Map<
    CheckIssueCode,
    { code: CheckIssueCode; message: string; count: number; retryAt: string | null }
  >();
  for (const container of containers.value) {
    const issue = container.checkIssue;
    if (!issue) continue;
    const existing = summaries.get(issue.code);
    if (existing) existing.count += 1;
    else summaries.set(issue.code, { ...issue, count: 1 });
  }
  return [...summaries.values()].filter(
    (summary) =>
      !dismissedIssues.value.has(summary.code) &&
      (summary.code === 'rate-limited' || summary.count > 1),
  );
});

function dismissIssue(code: CheckIssueCode): void {
  dismissedIssues.value = new Set([...dismissedIssues.value, code]);
}

function formatRetryAt(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function countForStatus(status: FilterStatus): number {
  if (status === 'all') return containers.value.length;
  return containers.value.filter((c) => c.status === status).length;
}

const counts = computed(() => ({
  breaking: countForStatus('breaking-change'),
  updates: countForStatus('update-available'),
  ok: countForStatus('up-to-date'),
  ahead: countForStatus('ahead'),
  unknown: countForStatus('unknown'),
  noRepo: countForStatus('no-repo'),
}));

const STATUS_ORDER: Record<ContainerInfo['status'], number> = {
  'breaking-change': 0,
  'update-available': 1,
  unknown: 2,
  'no-repo': 3,
  ahead: 4,
  'up-to-date': 5,
};

function publishedTime(container: ContainerInfo): number {
  if (!container.publishedAt) return 0;
  const timestamp = new Date(container.publishedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareContainers(left: ContainerInfo, right: ContainerInfo): number {
  if (sortMode.value === 'name') return left.name.localeCompare(right.name);
  if (sortMode.value === 'published') {
    return publishedTime(right) - publishedTime(left) || left.name.localeCompare(right.name);
  }
  if (sortMode.value === 'compose') {
    return left.composeFile.localeCompare(right.composeFile) || left.name.localeCompare(right.name);
  }
  return STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
}

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

  return [...list].sort(compareContainers);
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
      if (sortMode.value === 'name' || sortMode.value === 'compose') {
        return a.composeFile.localeCompare(b.composeFile);
      }
      if (sortMode.value === 'published') {
        const newestA = Math.max(0, ...a.containers.map(publishedTime));
        const newestB = Math.max(0, ...b.containers.map(publishedTime));
        return newestB - newestA || a.composeFile.localeCompare(b.composeFile);
      }
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

function setFilter(status: ContainerInfo['status']): void {
  filter.value = filter.value === status ? 'all' : status;
}

function scheduleAutoRefresh(): void {
  if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
  if (document.visibilityState !== 'visible') return;
  const delay = Math.max(0, AUTO_REFRESH_MS - (Date.now() - lastFetchAt));
  autoRefreshTimer = setTimeout(() => void refreshContainers(false), delay);
}

async function refreshContainers(forceRefresh = false): Promise<void> {
  await fetchContainers(forceRefresh);
  lastFetchAt = Date.now();
  scheduleAutoRefresh();
}

function handleVisibilityChange(): void {
  if (document.visibilityState !== 'visible') {
    if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
    autoRefreshTimer = null;
    return;
  }
  if (Date.now() - lastFetchAt >= AUTO_REFRESH_MS) void refreshContainers(false);
  else scheduleAutoRefresh();
}

watch([filter, sortMode, viewMode, collapsedGroups], savePreferences);

onMounted(() => {
  loadPreferences();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  void refreshContainers(false);
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
});
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
            <Container :size="20" :class="UI.primaryText" aria-hidden="true" />
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
          aria-label="Refresh container status"
          :class="`flex items-center gap-2 ${UI.inputBg} hover:bg-gray-700 disabled:opacity-50 border ${UI.borderSubtle} rounded-lg px-3 py-2 text-sm text-gray-300 transition-colors`"
          @click="refreshContainers(true)"
        >
          <RefreshCw :size="14" :class="refreshing ? 'animate-spin' : ''" aria-hidden="true" />
          {{ refreshing ? 'Checking…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <!-- Refresh error banner (keeps existing containers visible) -->
      <div
        v-if="refreshError"
        role="alert"
        :class="`${UI.errorBg} border ${UI.errorBorder} rounded-xl px-4 py-3 mb-5 flex items-center justify-between gap-4`"
      >
        <p :class="`${UI.errorText} text-sm`">Refresh failed: {{ refreshError }}</p>
        <button
          aria-label="Dismiss refresh error"
          :class="`${UI.errorText} ${UI.errorTextHover} text-sm shrink-0`"
          @click="refreshError = null"
        >
          Dismiss
        </button>
      </div>

      <div
        v-if="meta.stale || isRevalidating"
        role="status"
        aria-live="polite"
        :class="`${UI.inputBg} border ${UI.borderSubtle} rounded-xl px-4 py-3 mb-5 text-sm ${UI.textSecondary}`"
      >
        Showing cached data{{ isRevalidating ? ' while a fresh check runs…' : '.' }}
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

      <div
        v-for="summary in issueSummaries"
        :key="summary.code"
        role="alert"
        :class="`${UI.errorBg} border ${UI.errorBorder} rounded-xl px-4 py-3 mb-5 flex items-start justify-between gap-4`"
      >
        <p :class="`${UI.errorText} text-sm`">
          {{ summary.message }} Affected containers: {{ summary.count }}.
          <span v-if="formatRetryAt(summary.retryAt)">
            Try again after {{ formatRetryAt(summary.retryAt) }}.
          </span>
        </p>
        <button
          :aria-label="`Dismiss ${summary.code} warning`"
          :class="`${UI.errorText} ${UI.errorTextHover} text-sm shrink-0`"
          @click="dismissIssue(summary.code)"
        >
          Dismiss
        </button>
      </div>

      <!-- Stats -->
      <div
        v-if="!loading && containers.length > 0"
        class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-6"
      >
        <StatCard
          :icon="AlertCircle"
          :count="counts.breaking"
          label="Breaking"
          :bg-class="STATUS_THEME['breaking-change'].bg"
          :border-class="STATUS_THEME['breaking-change'].border"
          :text-class="STATUS_THEME['breaking-change'].text"
          :active="filter === 'breaking-change'"
          @select="setFilter('breaking-change')"
        />
        <StatCard
          :icon="AlertTriangle"
          :count="counts.updates"
          label="Updates"
          :bg-class="STATUS_THEME['update-available'].bg"
          :border-class="STATUS_THEME['update-available'].border"
          :text-class="STATUS_THEME['update-available'].text"
          :active="filter === 'update-available'"
          @select="setFilter('update-available')"
        />
        <StatCard
          :icon="CheckCircle"
          :count="counts.ok"
          label="Up to date"
          :bg-class="STATUS_THEME['up-to-date'].bg"
          :border-class="STATUS_THEME['up-to-date'].border"
          :text-class="STATUS_THEME['up-to-date'].text"
          :active="filter === 'up-to-date'"
          @select="setFilter('up-to-date')"
        />
        <StatCard
          :icon="TrendingUp"
          :count="counts.ahead"
          label="Ahead"
          :bg-class="STATUS_THEME.ahead.bg"
          :border-class="STATUS_THEME.ahead.border"
          :text-class="STATUS_THEME.ahead.text"
          :active="filter === 'ahead'"
          @select="setFilter('ahead')"
        />
        <StatCard
          :icon="HelpCircle"
          :count="counts.unknown"
          label="Unknown"
          :bg-class="STATUS_THEME.unknown.bg"
          :border-class="STATUS_THEME.unknown.border"
          :text-class="STATUS_THEME.unknown.text"
          :active="filter === 'unknown'"
          @select="setFilter('unknown')"
        />
        <StatCard
          :icon="HelpCircle"
          :count="counts.noRepo"
          label="No repo"
          :bg-class="STATUS_THEME['no-repo'].bg"
          :border-class="STATUS_THEME['no-repo'].border"
          :text-class="STATUS_THEME['no-repo'].text"
          :active="filter === 'no-repo'"
          @select="setFilter('no-repo')"
        />
      </div>

      <!-- Dashboard controls -->
      <div
        v-if="!loading && containers.length > 0"
        class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-3 mb-4"
      >
        <div class="relative">
          <label for="container-search" class="sr-only">Search containers</label>
          <Search
            :size="16"
            :class="`absolute left-3 top-1/2 -translate-y-1/2 ${UI.textMuted}`"
            aria-hidden="true"
          />
          <input
            id="container-search"
            v-model="searchQuery"
            type="text"
            placeholder="Search containers..."
            :class="`w-full pl-10 pr-4 py-2 rounded-lg text-sm ${UI.inputBg} border ${UI.borderInput} ${UI.textPrimary} placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-colors`"
          />
        </div>
        <div>
          <label for="container-sort" class="sr-only">Sort containers</label>
          <select
            id="container-sort"
            v-model="sortMode"
            :class="`w-full h-full px-3 py-2 rounded-lg text-sm ${UI.inputBg} border ${UI.borderInput} ${UI.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500/40`"
          >
            <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">
              Sort: {{ option.label }}
            </option>
          </select>
        </div>
        <div
          :class="`inline-flex ${UI.inputBg} border ${UI.borderInput} rounded-lg p-1`"
          aria-label="Dashboard view"
        >
          <button
            type="button"
            aria-label="Card view"
            :aria-pressed="viewMode === 'cards'"
            :class="`p-1.5 rounded ${viewMode === 'cards' ? `${UI.primaryBg} text-white` : UI.textSecondary}`"
            @click="viewMode = 'cards'"
          >
            <LayoutGrid :size="16" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Compact view"
            :aria-pressed="viewMode === 'compact'"
            :class="`p-1.5 rounded ${viewMode === 'compact' ? `${UI.primaryBg} text-white` : UI.textSecondary}`"
            @click="viewMode = 'compact'"
          >
            <List :size="16" aria-hidden="true" />
          </button>
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
          :aria-pressed="filter === opt.value"
          @click="filter = opt.value"
        >
          {{ opt.label }}
          <span v-if="opt.value !== 'all'" class="ml-1.5 opacity-60">
            {{ countForStatus(opt.value) }}
          </span>
        </button>
      </div>

      <!-- Loading -->
      <div
        v-if="loading"
        role="status"
        aria-live="polite"
        :class="`flex items-center justify-center py-24 ${UI.textMuted}`"
      >
        <RefreshCw :size="20" class="animate-spin mr-2" aria-hidden="true" />
        Scanning containers…
      </div>

      <!-- Error (initial load only – containers not yet available) -->
      <div
        v-else-if="error && containers.length === 0"
        role="alert"
        :class="`${UI.errorBg} border ${UI.errorBorder} rounded-xl p-6 text-center`"
      >
        <p :class="`${UI.errorText} font-medium`">Error loading containers</p>
        <p class="text-red-300/70 text-sm mt-1">{{ error }}</p>
        <button
          :class="`mt-4 text-sm ${UI.errorText} ${UI.errorTextHover} underline`"
          @click="refreshContainers()"
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
          :view-mode="viewMode"
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
