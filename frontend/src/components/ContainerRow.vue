<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ExternalLink, GitBranch, Package, PanelRightOpen } from '@lucide/vue';
import type { ContainerSummary } from '../types';
import { getContainerStatusPresentation, getUpstreamVersionLabel } from '../containerPresentation';
import { UI } from '../theme';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ container: ContainerSummary }>();
const emit = defineEmits<{
  linkRepo: [container: ContainerSummary];
  openDetail: [container: ContainerSummary];
}>();

const iconFailed = ref(false);
const presentation = computed(() => getContainerStatusPresentation(props.container));
const upstreamVersion = computed(() => getUpstreamVersionLabel(props.container));

watch(
  () => props.container.iconUrl,
  () => (iconFailed.value = false),
);
</script>

<template>
  <article
    :class="`${UI.cardBg} border ${UI.borderDefault} rounded-lg grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(13rem,1.35fr)_minmax(8rem,0.8fr)_minmax(9rem,0.9fr)_minmax(11rem,1fr)_auto] gap-x-4 gap-y-2 items-center px-4 py-2.5`"
  >
    <div class="flex items-center gap-2.5 min-w-0">
      <img
        v-if="container.iconUrl && !iconFailed"
        :src="container.iconUrl"
        alt=""
        class="h-5 w-5 rounded shrink-0"
        @error="iconFailed = true"
      />
      <Package v-else :size="17" :class="`${UI.textSecondary} shrink-0`" aria-hidden="true" />
      <div class="min-w-0">
        <h3 :class="`${UI.textPrimary} text-sm font-medium truncate`">
          <button
            type="button"
            class="truncate text-left rounded-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            @click="emit('openDetail', container)"
          >
            {{ container.name }}
          </button>
        </h3>
        <p :title="container.image" :class="`${UI.textMuted} text-xs font-mono truncate`">
          {{ container.image }}
        </p>
      </div>
    </div>
    <div class="hidden lg:block min-w-0">
      <p :title="container.currentVersion" :class="`${UI.textPrimary} text-xs font-mono truncate`">
        {{ container.currentVersion }}
      </p>
    </div>
    <div class="hidden lg:block min-w-0">
      <p
        :title="container.latestUpstreamVersion ?? presentation.description ?? upstreamVersion"
        :class="`${container.latestUpstreamVersion ? UI.textPrimary : UI.textMuted} text-xs font-mono truncate`"
      >
        {{ upstreamVersion }}
      </p>
    </div>
    <div class="min-w-0 justify-self-end lg:justify-self-stretch">
      <StatusBadge :container="container" />
      <p
        v-if="presentation.description"
        :title="presentation.description"
        :class="`${UI.textMuted} text-[11px] mt-1 line-clamp-2 lg:hidden xl:block`"
      >
        {{ presentation.description }}
      </p>
    </div>
    <div class="col-span-2 lg:col-span-1 flex items-center justify-end gap-2">
      <a
        v-if="container.releaseUrl"
        :href="container.releaseUrl"
        target="_blank"
        rel="noopener noreferrer"
        :class="`${UI.textSecondary} hover:text-white inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/60`"
        aria-label="Open release"
        title="Open the upstream release on GitHub"
      >
        <ExternalLink :size="14" aria-hidden="true" /> Release
      </a>
      <button
        type="button"
        :class="`${UI.primaryText} ${UI.primaryTextHover} inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/60`"
        :aria-label="`Edit GitHub repository for ${container.name}`"
        :title="container.githubRepo ? `Edit ${container.githubRepo}` : 'Link a GitHub repository'"
        @click="emit('linkRepo', container)"
      >
        <GitBranch :size="14" aria-hidden="true" />
        {{ container.githubRepo ? 'Repository' : 'Link repository' }}
      </button>
      <button
        type="button"
        :class="`${UI.primaryText} ${UI.primaryTextHover} bg-blue-500/10 border border-blue-500/20 inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/60`"
        @click="emit('openDetail', container)"
      >
        <PanelRightOpen :size="14" aria-hidden="true" /> Details
      </button>
    </div>
  </article>
</template>
