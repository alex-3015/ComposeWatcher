<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { X, ExternalLink, GitBranch, AlertTriangle, LoaderCircle } from '@lucide/vue';
import type { ContainerDetail, ContainerSummary } from '../types';
import StatusBadge from './StatusBadge.vue';
import {
  getContainerStatusPresentation,
  getRepositoryActionLabel,
  getUpstreamVersionLabel,
} from '../containerPresentation';
import { UI } from '../theme';
import { formatExactDate, formatRelativeTime } from '../format';

const ReleaseNotes = defineAsyncComponent(() => import('./ReleaseNotes.vue'));
const props = defineProps<{
  container: ContainerSummary;
  detail: ContainerDetail | null;
  loading: boolean;
  error: string | null;
}>();
const emit = defineEmits<{
  close: [];
  editRepository: [container: ContainerSummary];
  retry: [container: ContainerSummary];
}>();

const panel = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
let previouslyFocused: HTMLElement | null = null;
const visible = computed(() => props.detail ?? props.container);
const presentation = computed(() => getContainerStatusPresentation(visible.value));
const upstreamVersion = computed(() => getUpstreamVersionLabel(visible.value));
const repositoryActionLabel = computed(() => getRepositoryActionLabel(visible.value));
const repositoryNeedsFix = computed(() => visible.value.checkIssue?.code === 'repo-not-found');

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key !== 'Tab' || !panel.value) return;
  const focusable = [
    ...panel.value.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'),
  ];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(async () => {
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  closeButton.value?.focus();
});
onBeforeUnmount(() => previouslyFocused?.focus());
</script>

<template>
  <div class="fixed inset-0 z-40 bg-black/60" @click.self="emit('close')">
    <aside
      ref="panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-panel-title"
      :class="`${UI.pageBg} border-l ${UI.borderDefault} absolute inset-y-0 right-0 w-full sm:max-w-xl shadow-2xl overflow-y-auto`"
      @keydown="handleKeydown"
    >
      <header
        :class="`sticky top-0 z-10 ${UI.pageBg} border-b ${UI.borderDefault} px-5 py-4 flex items-start gap-3`"
      >
        <div class="min-w-0 flex-1">
          <p :class="`${UI.textMuted} text-xs font-mono truncate`">{{ container.composeFile }}</p>
          <h2 id="detail-panel-title" :class="`${UI.textPrimary} text-lg font-semibold truncate`">
            {{ container.name }}
          </h2>
        </div>
        <StatusBadge :container="visible" />
        <button
          ref="closeButton"
          type="button"
          aria-label="Close details"
          :class="`h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-lg ${UI.textSecondary} ${UI.textHover} focus:outline-none focus:ring-2 focus:ring-blue-500/60`"
          @click="emit('close')"
        >
          <X :size="20" aria-hidden="true" />
        </button>
      </header>

      <div class="p-5 space-y-5">
        <div class="grid grid-cols-2 gap-3">
          <div :class="`${UI.versionBoxBg} rounded-lg p-3`">
            <p :class="`${UI.textMuted} text-xs`">Image tag</p>
            <p :class="`${UI.textPrimary} font-mono text-sm break-all`">
              {{ visible.currentVersion }}
            </p>
          </div>
          <div :class="`${UI.versionBoxBg} rounded-lg p-3`">
            <p :class="`${UI.textMuted} text-xs`">Upstream release</p>
            <p :class="`${UI.textPrimary} font-mono text-sm break-all`">
              {{ upstreamVersion }}
            </p>
          </div>
        </div>

        <div
          :class="`${UI.inputBg} border ${UI.borderSubtle} rounded-lg p-3 text-sm ${UI.textSecondary}`"
        >
          <p>
            Data: <span :class="UI.textPrimary">{{ visible.dataState }}</span>
          </p>
          <p>
            Comparison: <span :class="UI.textPrimary">{{ visible.comparisonMode }}</span>
          </p>
          <p>
            Repository:
            <span :class="UI.textPrimary">{{ visible.githubRepo ?? 'Not linked' }}</span>
          </p>
          <p v-if="visible.lastChecked" :title="formatExactDate(visible.lastChecked)">
            Checked:
            <span :class="UI.textPrimary">{{ formatRelativeTime(visible.lastChecked) }}</span>
          </p>
          <p v-if="presentation.description" class="mt-2 text-xs">
            {{ presentation.description }}
          </p>
        </div>

        <div
          v-if="loading"
          role="status"
          :class="`flex items-center gap-2 py-10 justify-center ${UI.textSecondary}`"
        >
          <LoaderCircle :size="18" class="animate-spin" aria-hidden="true" /> Loading release
          details…
        </div>
        <div
          v-else-if="error"
          role="alert"
          class="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
        >
          <p>{{ error }}</p>
          <button
            type="button"
            class="mt-2 min-h-11 rounded px-2 underline"
            @click="emit('retry', container)"
          >
            Try again
          </button>
        </div>

        <template v-else-if="detail">
          <div v-if="detail.breakingChanges.length" class="space-y-2">
            <h3 :class="`${UI.textPrimary} font-medium flex items-center gap-2`">
              <AlertTriangle :size="16" /> Breaking-change hints
            </h3>
            <a
              v-for="change in detail.breakingChanges"
              :key="`${change.version}:${change.reason}`"
              :href="change.releaseUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="min-h-11 block rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300 hover:text-red-200"
            >
              <strong>{{ change.version }}</strong> — {{ change.reason }}
            </a>
          </div>
          <p v-if="detail.historyComplete === false" class="text-xs text-amber-300">
            Breaking-change history may be incomplete because more than 100 releases are available.
          </p>
          <ReleaseNotes :release-notes="detail.releaseNotes" :release-name="detail.releaseName" />
        </template>

        <div class="flex flex-wrap gap-3 pt-2">
          <a
            v-if="visible.releaseUrl"
            :href="visible.releaseUrl"
            target="_blank"
            rel="noopener noreferrer"
            :class="`min-h-11 inline-flex items-center gap-1 rounded-md px-2 text-sm ${UI.primaryText} ${UI.primaryTextHover}`"
            ><ExternalLink :size="14" /> Open release</a
          >
          <button
            type="button"
            :class="`min-h-11 inline-flex items-center gap-1 rounded-md px-2 text-sm ${
              repositoryNeedsFix
                ? 'text-amber-300 bg-amber-500/10 hover:text-amber-200'
                : `${UI.primaryText} ${UI.primaryTextHover}`
            }`"
            @click="emit('editRepository', container)"
          >
            <GitBranch :size="14" /> {{ repositoryActionLabel }}
          </button>
        </div>
      </div>
    </aside>
  </div>
</template>
