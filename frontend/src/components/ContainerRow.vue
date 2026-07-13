<script setup lang="ts">
import { ref } from 'vue';
import { ChevronDown, ExternalLink, GitBranch, Package } from '@lucide/vue';
import type { ContainerInfo } from '../types';
import { UI } from '../theme';
import { formatExactDate, formatRelativeTime } from '../format';
import StatusBadge from './StatusBadge.vue';
import ReleaseNotes from './ReleaseNotes.vue';

defineProps<{ container: ContainerInfo }>();

const emit = defineEmits<{ linkRepo: [container: ContainerInfo] }>();
const expanded = ref(false);
</script>

<template>
  <article :class="`${UI.cardBg} border ${UI.borderDefault} rounded-lg overflow-hidden`">
    <div
      class="grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(11rem,1.2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_auto_auto] gap-3 items-center px-4 py-3"
    >
      <div class="flex items-center gap-2 min-w-0">
        <Package :size="15" :class="`${UI.textSecondary} shrink-0`" aria-hidden="true" />
        <div class="min-w-0">
          <h3 :class="`${UI.textPrimary} text-sm font-medium truncate`">{{ container.name }}</h3>
          <p :class="`${UI.textMuted} text-xs font-mono truncate`">{{ container.composeFile }}</p>
        </div>
      </div>

      <div class="hidden lg:block min-w-0">
        <p :class="`${UI.textMuted} text-[11px]`">Image tag</p>
        <p :class="`${UI.textPrimary} text-xs font-mono truncate`">
          {{ container.currentVersion }}
        </p>
      </div>

      <div class="hidden lg:block min-w-0">
        <p :class="`${UI.textMuted} text-[11px]`">Upstream release</p>
        <p :class="`${UI.textPrimary} text-xs font-mono truncate`">
          {{ container.latestUpstreamVersion ?? '—' }}
        </p>
      </div>

      <StatusBadge :status="container.status" />

      <button
        :aria-expanded="expanded"
        :aria-label="`${expanded ? 'Hide' : 'Show'} details for ${container.name}`"
        :class="`${UI.textSecondary} ${UI.textHover} p-1 rounded`"
        @click="expanded = !expanded"
      >
        <ChevronDown
          :size="16"
          :class="`transition-transform ${expanded ? '' : '-rotate-90'}`"
          aria-hidden="true"
        />
      </button>
    </div>

    <div v-if="expanded" :class="`border-t ${UI.borderDefault} px-4 py-3`">
      <dl class="grid grid-cols-2 gap-3 lg:hidden mb-3">
        <div>
          <dt :class="`${UI.textMuted} text-[11px]`">Image tag</dt>
          <dd :class="`${UI.textPrimary} text-xs font-mono break-all`">
            {{ container.currentVersion }}
          </dd>
        </div>
        <div>
          <dt :class="`${UI.textMuted} text-[11px]`">Upstream release</dt>
          <dd :class="`${UI.textPrimary} text-xs font-mono break-all`">
            {{ container.latestUpstreamVersion ?? '—' }}
          </dd>
        </div>
      </dl>

      <div v-if="container.breakingChanges.length" class="mb-3 space-y-1">
        <a
          v-for="change in container.breakingChanges"
          :key="`${change.version}:${change.reason}`"
          :href="change.releaseUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="block text-xs text-red-300 hover:text-red-200"
        >
          {{ change.version }} — {{ change.reason }}
        </a>
      </div>

      <p v-if="container.checkIssue" class="text-xs text-amber-300 mb-3" role="status">
        {{ container.checkIssue.message }}
      </p>
      <p v-if="container.historyComplete === false" :class="`${UI.textSecondary} text-xs mb-3`">
        Breaking-change history may be incomplete.
      </p>

      <ReleaseNotes :release-notes="container.releaseNotes" :release-name="container.releaseName" />

      <div class="flex flex-wrap items-center gap-3 mt-3">
        <a
          v-if="container.releaseUrl"
          :href="container.releaseUrl"
          target="_blank"
          rel="noopener noreferrer"
          :class="`inline-flex items-center gap-1 text-xs ${UI.textSecondary} hover:text-white`"
        >
          <ExternalLink :size="12" aria-hidden="true" /> Release
        </a>
        <button
          :class="`inline-flex items-center gap-1 text-xs ${UI.primaryText} ${UI.primaryTextHover}`"
          @click="emit('linkRepo', container)"
        >
          <GitBranch :size="12" aria-hidden="true" />
          {{ container.githubRepo ?? 'Link repo' }}
        </button>
        <span
          v-if="container.lastChecked"
          :title="formatExactDate(container.lastChecked)"
          :class="`${UI.textMuted} text-xs ml-auto`"
        >
          Checked {{ formatRelativeTime(container.lastChecked) }}
        </span>
      </div>
    </div>
  </article>
</template>
