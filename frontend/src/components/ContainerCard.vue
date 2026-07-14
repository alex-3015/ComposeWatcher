<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ExternalLink, GitBranch, AlertTriangle, Package, PanelRightOpen } from '@lucide/vue';
import type { ContainerSummary } from '../types';
import StatusBadge from './StatusBadge.vue';
import { getContainerStatusPresentation, getUpstreamVersionLabel } from '../containerPresentation';
import { STATUS_THEME, UI } from '../theme';
import { formatExactDate, formatRelativeTime } from '../format';

const props = defineProps<{ container: ContainerSummary }>();
const emit = defineEmits<{
  linkRepo: [container: ContainerSummary];
  openDetail: [container: ContainerSummary];
}>();

const iconFailed = ref(false);
watch(
  () => props.container.iconUrl,
  () => (iconFailed.value = false),
);

const hasUpdate = computed(
  () =>
    props.container.status === 'update-available' || props.container.status === 'breaking-change',
);
const presentation = computed(() => getContainerStatusPresentation(props.container));
const upstreamVersion = computed(() => getUpstreamVersionLabel(props.container));
const cardClass = computed(() => {
  const status = STATUS_THEME[props.container.status];
  if (props.container.status === 'breaking-change')
    return `${status.borderStrong} ${status.shadow}`;
  if (hasUpdate.value) return STATUS_THEME['update-available'].borderStrong;
  return `${UI.borderDefault} hover:border-gray-700`;
});
</script>

<template>
  <article
    :class="`${UI.cardBg} border rounded-xl p-5 flex flex-col gap-4 transition-all ${cardClass}`"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0">
        <img
          v-if="container.iconUrl && !iconFailed"
          :src="container.iconUrl"
          alt=""
          class="w-5 h-5 shrink-0 rounded"
          @error="iconFailed = true"
        />
        <Package v-else :size="16" :class="`${UI.textSecondary} shrink-0`" aria-hidden="true" />
        <div class="min-w-0">
          <h3 :class="`${UI.textPrimary} font-semibold truncate`">{{ container.name }}</h3>
          <p :class="`${UI.textMuted} text-xs font-mono truncate`">{{ container.image }}</p>
        </div>
      </div>
      <StatusBadge :container="container" />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div :class="`${UI.versionBoxBg} rounded-lg px-3 py-2 min-w-0`">
        <p :class="`${UI.textMuted} text-xs mb-0.5`">Image tag</p>
        <p :class="`${UI.textPrimary} font-mono text-sm truncate`">
          {{ container.currentVersion }}
        </p>
      </div>
      <div
        :class="`rounded-lg px-3 py-2 min-w-0 ${hasUpdate ? STATUS_THEME['update-available'].bg : UI.versionBoxBg}`"
      >
        <p :class="`${UI.textMuted} text-xs mb-0.5`">Upstream release</p>
        <p
          :title="container.latestUpstreamVersion ?? presentation.description ?? upstreamVersion"
          :class="`font-mono text-sm truncate ${
            hasUpdate
              ? STATUS_THEME['update-available'].textLight
              : container.latestUpstreamVersion
                ? UI.textPrimary
                : UI.textMuted
          }`"
        >
          {{ upstreamVersion }}
        </p>
      </div>
    </div>

    <div class="flex flex-wrap gap-1.5 -mt-2">
      <span
        v-if="container.dataState !== 'fresh'"
        :class="`${UI.inputBg} border ${UI.borderSubtle} rounded-full px-2 py-0.5 text-[11px] ${UI.textSecondary}`"
      >
        {{ container.dataState }} data
      </span>
      <span
        v-if="container.comparisonMode === 'normalized'"
        :class="`${UI.inputBg} border ${UI.borderSubtle} rounded-full px-2 py-0.5 text-[11px] ${UI.textSecondary}`"
      >
        Normalized comparison
      </span>
      <span
        v-if="container.updateKind"
        :class="`${UI.inputBg} border ${UI.borderSubtle} rounded-full px-2 py-0.5 text-[11px] ${UI.textSecondary}`"
      >
        {{ container.updateKind }} update
      </span>
    </div>

    <div
      v-if="container.breakingChangeCount > 0"
      class="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300"
    >
      <AlertTriangle :size="14" aria-hidden="true" />
      {{ container.breakingChangeCount }} breaking hint{{
        container.breakingChangeCount === 1 ? '' : 's'
      }}
      detected
    </div>
    <p
      v-if="presentation.description"
      :class="`text-xs ${container.dataState === 'error' ? 'text-amber-300' : UI.textSecondary}`"
      role="status"
    >
      {{ presentation.description }}
    </p>

    <div :class="`mt-auto flex flex-col gap-2 pt-3 border-t ${UI.borderDefault}`">
      <button
        type="button"
        :class="`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm ${UI.primaryBg} ${UI.primaryBgHover}`"
        @click="emit('openDetail', container)"
      >
        <PanelRightOpen :size="14" aria-hidden="true" /> View details
      </button>
      <div class="flex items-center justify-between gap-2">
        <a
          v-if="container.releaseUrl"
          :href="container.releaseUrl"
          target="_blank"
          rel="noopener noreferrer"
          :class="`flex items-center gap-1 text-xs ${UI.textSecondary} hover:text-white`"
        >
          <ExternalLink :size="12" aria-hidden="true" /> Release
        </a>
        <button
          :aria-label="`Edit GitHub repository for ${container.name}`"
          :class="`flex items-center gap-1 text-xs ${UI.primaryText} ${UI.primaryTextHover} ml-auto max-w-[160px]`"
          @click="emit('linkRepo', container)"
        >
          <GitBranch :size="12" class="shrink-0" aria-hidden="true" />
          <span class="truncate">{{ container.githubRepo ?? 'Link repository' }}</span>
        </button>
      </div>
      <p
        v-if="container.lastChecked"
        :title="formatExactDate(container.lastChecked)"
        :class="`${UI.textDim} text-xs`"
      >
        Last checked: {{ formatRelativeTime(container.lastChecked) }}
      </p>
    </div>
  </article>
</template>
