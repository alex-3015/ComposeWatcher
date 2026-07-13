<script setup lang="ts">
import { computed, ref } from 'vue';
import { ExternalLink, GitBranch, AlertTriangle, Package } from '@lucide/vue';
import type { ContainerInfo } from '../types';
import StatusBadge from './StatusBadge.vue';
import ReleaseNotes from './ReleaseNotes.vue';
import { STATUS_THEME, UI } from '../theme';
import { getContainerIconUrl } from '../iconMap';
import { formatExactDate, formatRelativeTime } from '../format';

const props = defineProps<{
  container: ContainerInfo;
}>();

const emit = defineEmits<{
  linkRepo: [container: ContainerInfo];
}>();

const iconFailed = ref(false);
const iconUrl = computed(() => getContainerIconUrl(props.container.name));

const hasUpdate = computed(
  () =>
    props.container.status === 'update-available' || props.container.status === 'breaking-change',
);

const cardClass = computed(() => {
  const s = STATUS_THEME[props.container.status];
  if (props.container.status === 'breaking-change') return `${s.borderStrong} ${s.shadow}`;
  if (hasUpdate.value) return STATUS_THEME['update-available'].borderStrong;
  return `${UI.borderDefault} hover:border-gray-700`;
});
</script>

<template>
  <div
    :class="`${UI.cardBg} border rounded-xl p-5 flex flex-col gap-4 transition-all ${cardClass}`"
  >
    <!-- Header -->
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0">
        <img
          v-if="!iconFailed"
          :src="iconUrl"
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
      <StatusBadge :status="container.status" />
    </div>

    <!-- Version info -->
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
          :class="`font-mono text-sm truncate ${hasUpdate ? STATUS_THEME['update-available'].textLight : UI.textPrimary}`"
        >
          {{ container.latestUpstreamVersion ?? '—' }}
        </p>
      </div>
    </div>

    <div class="flex flex-wrap gap-1.5 -mt-2">
      <span
        v-if="container.comparisonMode === 'normalized'"
        :class="`${UI.inputBg} border ${UI.borderSubtle} rounded-full px-2 py-0.5 text-[11px] ${UI.textSecondary}`"
      >
        Normalized upstream comparison
      </span>
      <span
        v-if="container.updateKind"
        :class="`${UI.inputBg} border ${UI.borderSubtle} rounded-full px-2 py-0.5 text-[11px] ${UI.textSecondary}`"
      >
        {{ container.updateKind }} update
      </span>
    </div>

    <!-- Breaking change warning -->
    <div
      v-if="container.breakingChanges.length > 0"
      :class="`${STATUS_THEME['breaking-change'].bg} border ${STATUS_THEME['breaking-change'].border} rounded-lg px-3 py-2.5`"
    >
      <div
        v-for="change in container.breakingChanges"
        :key="`${change.version}:${change.reason}`"
        class="flex items-start gap-2 [&:not(:last-child)]:mb-2"
      >
        <AlertTriangle
          :size="14"
          :class="`${STATUS_THEME['breaking-change'].text} shrink-0 mt-0.5`"
          aria-hidden="true"
        />
        <p
          :class="`${STATUS_THEME['breaking-change'].textLight} text-xs leading-relaxed break-words min-w-0`"
        >
          <a :href="change.releaseUrl" target="_blank" rel="noopener noreferrer" class="underline">
            {{ change.version }}
          </a>
          — {{ change.reason }}
        </p>
      </div>
    </div>

    <div
      v-if="container.historyComplete === false"
      :class="`${UI.inputBg} border ${UI.borderSubtle} rounded-lg px-3 py-2 text-xs ${UI.textSecondary}`"
      role="status"
    >
      Breaking-change history may be incomplete because more than 100 releases are available.
    </div>

    <div
      v-if="container.releaseDataStale"
      class="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
      role="status"
    >
      Showing cached upstream release data.
    </div>

    <div
      v-if="container.checkIssue"
      :class="`flex items-start gap-2 ${UI.inputBg} border ${UI.borderSubtle} rounded-lg px-3 py-2.5`"
      role="status"
    >
      <AlertTriangle :size="14" :class="`${UI.textSecondary} shrink-0 mt-0.5`" aria-hidden="true" />
      <p :class="`${UI.textSecondary} text-xs leading-relaxed break-words min-w-0`">
        {{ container.checkIssue.message }}
      </p>
    </div>

    <!-- Release Notes -->
    <ReleaseNotes :release-notes="container.releaseNotes" :release-name="container.releaseName" />

    <!-- Footer -->
    <div :class="`flex flex-col gap-1.5 pt-1 border-t ${UI.borderDefault}`">
      <div class="flex items-center justify-between gap-2">
        <p :class="`${UI.textFaint} text-xs font-mono truncate min-w-0`">
          {{ container.composeFile }}
        </p>
        <div class="flex items-center gap-2 shrink-0">
          <a
            v-if="container.releaseUrl"
            :href="container.releaseUrl"
            target="_blank"
            rel="noopener noreferrer"
            :class="`flex items-center gap-1 text-xs ${UI.textSecondary} hover:text-white transition-colors`"
          >
            <ExternalLink :size="12" aria-hidden="true" />
            Release
          </a>
          <button
            :aria-label="`Edit GitHub repository for ${container.name}`"
            :class="`flex items-center gap-1 text-xs ${UI.primaryText} ${UI.primaryTextHover} transition-colors max-w-[140px]`"
            @click="emit('linkRepo', container)"
          >
            <GitBranch :size="12" class="shrink-0" aria-hidden="true" />
            <span class="truncate">{{ container.githubRepo ?? 'Link repo' }}</span>
          </button>
        </div>
      </div>
      <p
        v-if="container.lastChecked"
        :title="formatExactDate(container.lastChecked)"
        :class="`${UI.textDim} text-xs`"
      >
        Last checked: {{ formatRelativeTime(container.lastChecked) }}
      </p>
    </div>
  </div>
</template>
