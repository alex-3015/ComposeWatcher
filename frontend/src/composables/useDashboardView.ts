import { computed, ref, watch } from 'vue';
import type { ContainerStatus, ContainerSummary } from '../types';

export type FilterMode = 'all' | 'breaking' | 'updates' | 'attention' | 'current';
export type SortMode = 'priority' | 'name' | 'compose' | 'published';
export type ViewMode = 'cards' | 'compact';

const PREFERENCES_KEY = 'compose-watcher:dashboard:v3';
const STATUS_ORDER: Record<ContainerStatus, number> = {
  'breaking-change': 0,
  'update-available': 1,
  unknown: 2,
  'no-repo': 3,
  ahead: 4,
  'up-to-date': 5,
};

export const FILTER_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'breaking', label: 'Breaking' },
  { value: 'updates', label: 'Updates' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'current', label: 'Current' },
];

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'name', label: 'Name' },
  { value: 'compose', label: 'Compose file' },
  { value: 'published', label: 'Release date' },
];

function matchesFilter(container: ContainerSummary, filter: FilterMode): boolean {
  if (filter === 'all') return true;
  if (filter === 'breaking') return container.status === 'breaking-change';
  if (filter === 'updates') return container.status === 'update-available';
  if (filter === 'current')
    return container.status === 'up-to-date' || container.status === 'ahead';
  return (
    container.status === 'unknown' ||
    container.status === 'no-repo' ||
    container.dataState === 'stale' ||
    container.dataState === 'error'
  );
}

function publishedTime(container: ContainerSummary): number {
  const timestamp = container.publishedAt ? new Date(container.publishedAt).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function useDashboardView(containers: { value: ContainerSummary[] }) {
  const filter = ref<FilterMode>('all');
  const sortMode = ref<SortMode>('priority');
  const viewMode = ref<ViewMode>('cards');
  const searchQuery = ref('');
  const collapsedGroups = ref<Set<string>>(new Set());

  function compare(left: ContainerSummary, right: ContainerSummary): number {
    if (sortMode.value === 'name') return left.name.localeCompare(right.name);
    if (sortMode.value === 'compose') {
      return (
        left.composeFile.localeCompare(right.composeFile) || left.name.localeCompare(right.name)
      );
    }
    if (sortMode.value === 'published') {
      return publishedTime(right) - publishedTime(left) || left.name.localeCompare(right.name);
    }
    return (
      STATUS_ORDER[left.status] - STATUS_ORDER[right.status] || left.name.localeCompare(right.name)
    );
  }

  const filtered = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    return containers.value
      .filter((container) => matchesFilter(container, filter.value))
      .filter(
        (container) =>
          !query ||
          container.name.toLowerCase().includes(query) ||
          container.image.toLowerCase().includes(query) ||
          container.composeFile.toLowerCase().includes(query) ||
          container.githubRepo?.toLowerCase().includes(query),
      )
      .sort(compare);
  });

  const grouped = computed(() => {
    const groups = new Map<string, ContainerSummary[]>();
    for (const container of filtered.value) {
      const current = groups.get(container.composeFile) ?? [];
      current.push(container);
      groups.set(container.composeFile, current);
    }
    return [...groups.entries()]
      .map(([composeFile, items]) => ({
        composeFile,
        containers: items,
        counts: {
          breaking: items.filter((item) => item.status === 'breaking-change').length,
          updates: items.filter((item) => item.status === 'update-available').length,
          total: items.length,
        },
      }))
      .sort((left, right) => {
        if (sortMode.value === 'priority') {
          const leftUrgent = left.counts.breaking + left.counts.updates;
          const rightUrgent = right.counts.breaking + right.counts.updates;
          if (leftUrgent !== rightUrgent) return rightUrgent - leftUrgent;
        }
        return left.composeFile.localeCompare(right.composeFile);
      });
  });

  const counts = computed(() => ({
    all: containers.value.length,
    breaking: containers.value.filter((container) => matchesFilter(container, 'breaking')).length,
    updates: containers.value.filter((container) => matchesFilter(container, 'updates')).length,
    attention: containers.value.filter((container) => matchesFilter(container, 'attention')).length,
    current: containers.value.filter((container) => matchesFilter(container, 'current')).length,
  }));

  function toggleGroup(composeFile: string): void {
    const next = new Set(collapsedGroups.value);
    if (next.has(composeFile)) next.delete(composeFile);
    else next.add(composeFile);
    collapsedGroups.value = next;
  }

  function setGroupsExpanded(composeFiles: string[], expanded: boolean): void {
    const next = new Set(collapsedGroups.value);
    for (const composeFile of composeFiles) {
      if (expanded) next.delete(composeFile);
      else next.add(composeFile);
    }
    collapsedGroups.value = next;
  }

  function loadPreferences(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') as Record<
        string,
        unknown
      >;
      if (FILTER_OPTIONS.some((option) => option.value === saved.filter))
        filter.value = saved.filter as FilterMode;
      if (SORT_OPTIONS.some((option) => option.value === saved.sortMode))
        sortMode.value = saved.sortMode as SortMode;
      if (saved.viewMode === 'cards' || saved.viewMode === 'compact')
        viewMode.value = saved.viewMode;
      if (Array.isArray(saved.collapsedGroups)) {
        collapsedGroups.value = new Set(
          saved.collapsedGroups.filter((value): value is string => typeof value === 'string'),
        );
      }
    } catch {
      localStorage.removeItem(PREFERENCES_KEY);
    }
  }

  watch([filter, sortMode, viewMode, collapsedGroups], () => {
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
      // Preferences remain optional when browser storage is unavailable.
    }
  });

  return {
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
  };
}
