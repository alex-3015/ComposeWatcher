<script setup lang="ts">
import { AlertCircle, AlertTriangle, CheckCircle, LayoutGrid, List, Search } from '@lucide/vue';
import type { FilterMode, SortMode, ViewMode } from '../composables/useDashboardView';
import { FILTER_OPTIONS, SORT_OPTIONS } from '../composables/useDashboardView';
import { STATUS_THEME, UI } from '../theme';
import StatCard from './StatCard.vue';

defineProps<{ counts: Record<FilterMode, number> }>();
const filter = defineModel<FilterMode>('filter', { required: true });
const sortMode = defineModel<SortMode>('sortMode', { required: true });
const viewMode = defineModel<ViewMode>('viewMode', { required: true });
const searchQuery = defineModel<string>('searchQuery', { required: true });
</script>

<template>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
    <StatCard
      :icon="AlertCircle"
      :count="counts.breaking"
      label="Breaking"
      :bg-class="STATUS_THEME['breaking-change'].bg"
      :border-class="STATUS_THEME['breaking-change'].border"
      :text-class="STATUS_THEME['breaking-change'].text"
      :active="filter === 'breaking'"
      @select="filter = filter === 'breaking' ? 'all' : 'breaking'"
    />
    <StatCard
      :icon="AlertTriangle"
      :count="counts.updates"
      label="Updates"
      :bg-class="STATUS_THEME['update-available'].bg"
      :border-class="STATUS_THEME['update-available'].border"
      :text-class="STATUS_THEME['update-available'].text"
      :active="filter === 'updates'"
      @select="filter = filter === 'updates' ? 'all' : 'updates'"
    />
    <StatCard
      :icon="AlertTriangle"
      :count="counts.attention"
      label="Needs attention"
      :bg-class="STATUS_THEME.unknown.bg"
      :border-class="STATUS_THEME.unknown.border"
      :text-class="STATUS_THEME.unknown.text"
      :active="filter === 'attention'"
      @select="filter = filter === 'attention' ? 'all' : 'attention'"
    />
    <StatCard
      :icon="CheckCircle"
      :count="counts.current"
      label="Current"
      :bg-class="STATUS_THEME['up-to-date'].bg"
      :border-class="STATUS_THEME['up-to-date'].border"
      :text-class="STATUS_THEME['up-to-date'].text"
      :active="filter === 'current'"
      @select="filter = filter === 'current' ? 'all' : 'current'"
    />
  </div>

  <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-3 mb-4">
    <div class="relative">
      <label for="container-search" class="sr-only">Search containers</label>
      <Search :size="16" :class="`absolute left-3 top-1/2 -translate-y-1/2 ${UI.textMuted}`" />
      <input
        id="container-search"
        v-model="searchQuery"
        type="search"
        placeholder="Search name, image, repository, or Compose file…"
        :class="`w-full pl-10 pr-4 py-2 rounded-lg text-sm ${UI.inputBg} border ${UI.borderInput}`"
      />
    </div>
    <select
      v-model="sortMode"
      aria-label="Sort containers"
      :class="`${UI.inputBg} border ${UI.borderInput} rounded-lg px-3 py-2 text-sm`"
    >
      <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">
        Sort: {{ option.label }}
      </option>
    </select>
    <div
      :class="`inline-flex ${UI.inputBg} border ${UI.borderInput} rounded-lg p-1`"
      aria-label="Dashboard view"
    >
      <button
        aria-label="Card view"
        :aria-pressed="viewMode === 'cards'"
        :class="`p-1.5 rounded ${viewMode === 'cards' ? UI.primaryBg : UI.textSecondary}`"
        @click="viewMode = 'cards'"
      >
        <LayoutGrid :size="16" />
      </button>
      <button
        aria-label="Compact view"
        :aria-pressed="viewMode === 'compact'"
        :class="`p-1.5 rounded ${viewMode === 'compact' ? UI.primaryBg : UI.textSecondary}`"
        @click="viewMode = 'compact'"
      >
        <List :size="16" />
      </button>
    </div>
  </div>

  <div class="flex flex-wrap gap-2 mb-5">
    <button
      v-for="option in FILTER_OPTIONS"
      :key="option.value"
      :aria-pressed="filter === option.value"
      :class="[
        'px-3 py-1.5 rounded-lg text-xs font-medium border',
        filter === option.value
          ? `${UI.primaryBg} border-blue-500`
          : `${UI.inputBg} ${UI.borderSubtle} ${UI.textSecondary}`,
      ]"
      @click="filter = option.value"
    >
      {{ option.label }} <span class="ml-1 opacity-60">{{ counts[option.value] }}</span>
    </button>
  </div>
</template>
