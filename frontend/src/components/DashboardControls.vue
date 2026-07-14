<script setup lang="ts">
import { LayoutGrid, List, Search } from '@lucide/vue';
import type { FilterMode, SortMode, ViewMode } from '../composables/useDashboardView';
import { FILTER_OPTIONS, SORT_OPTIONS } from '../composables/useDashboardView';
import { UI } from '../theme';

defineProps<{ counts: Record<FilterMode, number> }>();
const filter = defineModel<FilterMode>('filter', { required: true });
const sortMode = defineModel<SortMode>('sortMode', { required: true });
const viewMode = defineModel<ViewMode>('viewMode', { required: true });
const searchQuery = defineModel<string>('searchQuery', { required: true });
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-3 mb-4">
    <div class="relative">
      <label for="container-search" class="sr-only">Search containers</label>
      <Search :size="16" :class="`absolute left-3 top-1/2 -translate-y-1/2 ${UI.textMuted}`" />
      <input
        id="container-search"
        v-model="searchQuery"
        type="search"
        placeholder="Search name, image, repository, or Compose file…"
        :class="`w-full min-h-11 pl-10 pr-4 py-2 rounded-lg text-sm placeholder:text-gray-400 ${UI.inputBg} border ${UI.borderInput}`"
      />
    </div>
    <select
      v-model="sortMode"
      aria-label="Sort containers"
      :class="`min-h-11 ${UI.inputBg} border ${UI.borderInput} rounded-lg px-3 py-2 text-sm`"
    >
      <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">
        Sort: {{ option.label }}
      </option>
    </select>
    <div
      :class="`inline-flex w-fit justify-self-start ${UI.inputBg} border ${UI.borderInput} rounded-lg p-1`"
      aria-label="Dashboard view"
    >
      <button
        type="button"
        aria-label="Card view"
        :aria-pressed="viewMode === 'cards'"
        :class="`min-h-11 min-w-11 inline-flex items-center justify-center rounded ${viewMode === 'cards' ? UI.primaryBg : UI.textSecondary}`"
        @click="viewMode = 'cards'"
      >
        <LayoutGrid :size="16" />
      </button>
      <button
        type="button"
        aria-label="Compact view"
        :aria-pressed="viewMode === 'compact'"
        :class="`min-h-11 min-w-11 inline-flex items-center justify-center rounded ${viewMode === 'compact' ? UI.primaryBg : UI.textSecondary}`"
        @click="viewMode = 'compact'"
      >
        <List :size="16" />
      </button>
    </div>
  </div>

  <div class="flex flex-wrap gap-2 mb-5" role="group" aria-label="Container filters">
    <button
      v-for="option in FILTER_OPTIONS"
      :key="option.value"
      type="button"
      :aria-pressed="filter === option.value"
      :class="[
        'min-h-11 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border focus:outline-none focus:ring-2 focus:ring-blue-500/60',
        filter === option.value
          ? `${UI.primaryBg} border-blue-400 text-white`
          : `${UI.inputBg} ${UI.borderSubtle} ${UI.textSecondary} hover:border-gray-500`,
      ]"
      @click="filter = option.value"
    >
      {{ option.label }}
      <span
        :class="`min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs ${
          filter === option.value ? 'bg-white/15 text-white' : 'bg-gray-700 text-gray-300'
        }`"
      >
        {{ counts[option.value] }}
      </span>
    </button>
  </div>
</template>
