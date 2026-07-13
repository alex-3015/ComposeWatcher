<script setup lang="ts">
import { ExternalLink, GitBranch, Package, PanelRightOpen } from '@lucide/vue';
import type { ContainerSummary } from '../types';
import { UI } from '../theme';
import StatusBadge from './StatusBadge.vue';

defineProps<{ container: ContainerSummary }>();
const emit = defineEmits<{
  linkRepo: [container: ContainerSummary];
  openDetail: [container: ContainerSummary];
}>();
</script>

<template>
  <article
    :class="`${UI.cardBg} border ${UI.borderDefault} rounded-lg grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(11rem,1.2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_auto_auto] gap-3 items-center px-4 py-3`"
  >
    <div class="flex items-center gap-2 min-w-0">
      <img v-if="container.iconUrl" :src="container.iconUrl" alt="" class="h-4 w-4 rounded" />
      <Package v-else :size="15" :class="`${UI.textSecondary} shrink-0`" aria-hidden="true" />
      <div class="min-w-0">
        <h3 :class="`${UI.textPrimary} text-sm font-medium truncate`">{{ container.name }}</h3>
        <p :class="`${UI.textMuted} text-xs font-mono truncate`">{{ container.composeFile }}</p>
      </div>
    </div>
    <div class="hidden lg:block min-w-0">
      <p :class="`${UI.textMuted} text-[11px]`">Image tag</p>
      <p :class="`${UI.textPrimary} text-xs font-mono truncate`">{{ container.currentVersion }}</p>
    </div>
    <div class="hidden lg:block min-w-0">
      <p :class="`${UI.textMuted} text-[11px]`">Upstream release</p>
      <p :class="`${UI.textPrimary} text-xs font-mono truncate`">
        {{ container.latestUpstreamVersion ?? '—' }}
      </p>
    </div>
    <StatusBadge :status="container.status" />
    <div class="col-span-2 lg:col-span-1 flex items-center justify-end gap-2">
      <a
        v-if="container.releaseUrl"
        :href="container.releaseUrl"
        target="_blank"
        rel="noopener noreferrer"
        :class="`${UI.textSecondary} hover:text-white p-1`"
        aria-label="Open release"
        ><ExternalLink :size="15" aria-hidden="true"
      /></a>
      <button
        :class="`${UI.primaryText} ${UI.primaryTextHover} p-1`"
        :aria-label="`Edit GitHub repository for ${container.name}`"
        @click="emit('linkRepo', container)"
      >
        <GitBranch :size="15" aria-hidden="true" />
      </button>
      <button
        :class="`${UI.primaryText} ${UI.primaryTextHover} inline-flex items-center gap-1 text-xs`"
        @click="emit('openDetail', container)"
      >
        <PanelRightOpen :size="15" aria-hidden="true" /> Details
      </button>
    </div>
  </article>
</template>
