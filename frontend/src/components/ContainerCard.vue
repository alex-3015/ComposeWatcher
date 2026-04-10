<script setup lang="ts">
import { computed } from 'vue';
import { ExternalLink, GitBranch, AlertTriangle, Package } from 'lucide-vue-next';
import type { ContainerInfo } from '../types';
import StatusBadge from './StatusBadge.vue';
import { STATUS_THEME, UI } from '../theme';

const props = defineProps<{
  container: ContainerInfo;
}>();

const emit = defineEmits<{
  linkRepo: [container: ContainerInfo];
}>();

const hasUpdate = computed(
  () => props.container.status === 'update-available' || props.container.status === 'breaking-change'
);

const cardClass = computed(() => {
  const s = STATUS_THEME[props.container.status];
  if (props.container.status === 'breaking-change') return `${s.borderStrong} ${s.shadow}`;
  if (hasUpdate.value) return STATUS_THEME['update-available'].borderStrong;
  return `${UI.borderDefault} hover:border-gray-700`;
});

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
</script>

<template>
  <div :class="`${UI.cardBg} border rounded-xl p-5 flex flex-col gap-4 transition-all ${cardClass}`">
    <!-- Header -->
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0">
        <Package :size="16" :class="`${UI.textSecondary} shrink-0`" />
        <div class="min-w-0">
          <h3 :class="`${UI.textPrimary} font-semibold truncate`">{{ container.name }}</h3>
          <p :class="`${UI.textMuted} text-xs font-mono truncate`">{{ container.image }}</p>
        </div>
      </div>
      <StatusBadge :status="container.status" />
    </div>

    <!-- Version info -->
    <div class="grid grid-cols-2 gap-3">
      <div :class="`${UI.versionBoxBg} rounded-lg px-3 py-2 min-w-0`">
        <p :class="`${UI.textMuted} text-xs mb-0.5`">Current</p>
        <p :class="`${UI.textPrimary} font-mono text-sm truncate`">{{ container.currentVersion }}</p>
      </div>
      <div :class="`rounded-lg px-3 py-2 min-w-0 ${hasUpdate ? STATUS_THEME['update-available'].bg : UI.versionBoxBg}`">
        <p :class="`${UI.textMuted} text-xs mb-0.5`">Latest</p>
        <p :class="`font-mono text-sm truncate ${hasUpdate ? STATUS_THEME['update-available'].textLight : UI.textPrimary}`">
          {{ container.latestVersion ?? '—' }}
        </p>
      </div>
    </div>

    <!-- Breaking change warning -->
    <div
      v-if="container.status === 'breaking-change' && container.breakingChangeReason"
      :class="`flex items-start gap-2 ${STATUS_THEME['breaking-change'].bg} border ${STATUS_THEME['breaking-change'].border} rounded-lg px-3 py-2.5`"
    >
      <AlertTriangle :size="14" :class="`${STATUS_THEME['breaking-change'].text} shrink-0 mt-0.5`" />
      <p :class="`${STATUS_THEME['breaking-change'].textLight} text-xs leading-relaxed break-words min-w-0`">{{ container.breakingChangeReason }}</p>
    </div>

    <!-- Footer -->
    <div :class="`flex flex-col gap-1.5 pt-1 border-t ${UI.borderDefault}`">
      <div class="flex items-center justify-between gap-2">
        <p :class="`${UI.textFaint} text-xs font-mono truncate min-w-0`">{{ container.composeFile }}</p>
        <div class="flex items-center gap-2 shrink-0">
          <a
            v-if="container.releaseUrl"
            :href="container.releaseUrl"
            target="_blank"
            rel="noreferrer"
            :class="`flex items-center gap-1 text-xs ${UI.textSecondary} hover:text-white transition-colors`"
          >
            <ExternalLink :size="12" />
            Release
          </a>
          <button
            :class="`flex items-center gap-1 text-xs ${UI.primaryText} ${UI.primaryTextHover} transition-colors max-w-[140px]`"
            @click="emit('linkRepo', container)"
          >
            <GitBranch :size="12" class="shrink-0" />
            <span class="truncate">{{ container.githubRepo ?? 'Link repo' }}</span>
          </button>
        </div>
      </div>
      <p v-if="container.lastChecked" :class="`${UI.textDim} text-xs`">
        Last checked: {{ formatDate(container.lastChecked) }}
      </p>
    </div>
  </div>
</template>
