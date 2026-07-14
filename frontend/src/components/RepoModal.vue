<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { X, GitBranch } from '@lucide/vue';
import type { ContainerSummary } from '../types';
import { UI } from '../theme';

const props = defineProps<{
  container: ContainerSummary;
  saveError?: string | null;
}>();

const emit = defineEmits<{
  close: [];
  save: [containerId: string, repo: string | null];
}>();

const value = ref(props.container.githubRepo ?? '');
const saving = ref(false);
const error = ref('');
const modal = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
let previouslyFocused: HTMLElement | null = null;
const dialogTitle = computed(() => {
  if (!props.container.githubRepo) return 'Link GitHub Repository';
  if (props.container.checkIssue?.code === 'repo-not-found') return 'Fix GitHub Repository';
  return 'Edit GitHub Repository';
});

const REPO_FORMAT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

watch(
  () => props.saveError,
  (err) => {
    if (err != null) {
      saving.value = false;
      error.value = err;
    }
  },
);

function handleSave() {
  const trimmed = value.value.trim();
  if (trimmed && !REPO_FORMAT.test(trimmed)) {
    error.value = 'Format: owner/repository';
    return;
  }
  saving.value = true;
  emit('save', props.container.id, trimmed || null);
}

function handleRemove() {
  saving.value = true;
  emit('save', props.container.id, null);
}

function close(): void {
  if (!saving.value) emit('close');
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab' || !modal.value) return;
  const focusable = [
    ...modal.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'),
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
  input.value?.focus();
});

onBeforeUnmount(() => previouslyFocused?.focus());
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    @click.self="close"
    @keydown="handleKeydown"
  >
    <div
      ref="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="repo-modal-title"
      :class="`${UI.cardBg} border ${UI.borderSubtle} rounded-xl shadow-2xl w-full max-w-md mx-4 p-6`"
    >
      <!-- Title -->
      <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-2">
          <GitBranch :size="18" :class="UI.primaryText" aria-hidden="true" />
          <h2 id="repo-modal-title" :class="`text-base font-semibold ${UI.textPrimary}`">
            {{ dialogTitle }}
          </h2>
        </div>
        <button
          :disabled="saving"
          type="button"
          aria-label="Close repository dialog"
          :class="`h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-lg ${UI.textMuted} ${UI.textHover} disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/60`"
          @click="close"
        >
          <X :size="18" aria-hidden="true" />
        </button>
      </div>

      <!-- Container info -->
      <div class="mb-4">
        <p :class="`text-sm ${UI.textSecondary} mb-1`">Container</p>
        <p :class="`${UI.textPrimary} font-mono text-sm ${UI.inputBg} rounded-lg px-3 py-2`">
          {{ container.name }}
        </p>
        <p :class="`${UI.textMuted} font-mono text-xs mt-1`">{{ container.image }}</p>
      </div>

      <!-- Input -->
      <div class="mb-5">
        <label for="github-repository" :class="`block text-sm ${UI.textSecondary} mb-1.5`">
          GitHub Repository
        </label>
        <input
          id="github-repository"
          ref="input"
          v-model="value"
          type="text"
          placeholder="owner/repository"
          :aria-invalid="Boolean(error)"
          :aria-describedby="error ? 'repo-error' : undefined"
          :class="`w-full min-h-11 ${UI.inputBg} border ${UI.borderInput} rounded-lg px-3 py-2.5 ${UI.textPrimary} placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-colors`"
          @input="error = ''"
          @keydown.enter="handleSave"
        />
        <p v-if="error" id="repo-error" role="alert" :class="`${UI.errorText} text-xs mt-1.5`">
          {{ error }}
        </p>
      </div>

      <!-- Actions -->
      <div class="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          :disabled="saving"
          :class="`min-h-11 flex-1 ${UI.primaryBg} ${UI.primaryBgHover} disabled:opacity-50 ${UI.textPrimary} text-sm font-medium rounded-lg px-4 py-2.5 transition-colors`"
          @click="handleSave"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button
          v-if="container.githubRepo"
          type="button"
          :disabled="saving"
          :class="`min-h-11 px-4 py-2.5 text-sm ${UI.errorText} ${UI.errorTextHover} disabled:opacity-50 border ${UI.borderSubtle} rounded-lg transition-colors`"
          @click="handleRemove"
        >
          Remove
        </button>
        <button
          type="button"
          :disabled="saving"
          :class="`min-h-11 px-4 py-2.5 text-sm ${UI.textSecondary} ${UI.textHover} border ${UI.borderSubtle} rounded-lg transition-colors`"
          @click="close"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>
