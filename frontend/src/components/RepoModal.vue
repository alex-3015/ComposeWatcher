<script setup lang="ts">
import { ref, watch } from 'vue';
import { X, GitBranch } from 'lucide-vue-next';
import type { ContainerInfo } from '../types';
import { UI } from '../theme';

const props = defineProps<{
  container: ContainerInfo;
  saveError?: string | null;
}>();

const emit = defineEmits<{
  close: [];
  save: [containerId: string, repo: string | null];
}>();

const value = ref(props.container.githubRepo ?? '');
const saving = ref(false);
const error = ref('');

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
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div
      :class="`${UI.cardBg} border ${UI.borderSubtle} rounded-xl shadow-2xl w-full max-w-md mx-4 p-6`"
    >
      <!-- Title -->
      <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-2">
          <GitBranch :size="18" :class="UI.primaryText" />
          <h2 :class="`text-base font-semibold ${UI.textPrimary}`">Link GitHub Repository</h2>
        </div>
        <button :class="`${UI.textMuted} ${UI.textHover} transition-colors`" @click="emit('close')">
          <X :size="18" />
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
        <label :class="`block text-sm ${UI.textSecondary} mb-1.5`">GitHub Repository</label>
        <input
          v-model="value"
          type="text"
          placeholder="owner/repository"
          autofocus
          :class="`w-full ${UI.inputBg} border ${UI.borderInput} rounded-lg px-3 py-2.5 ${UI.textPrimary} placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-colors`"
          @input="error = ''"
          @keydown.enter="handleSave"
        />
        <p v-if="error" :class="`${UI.errorText} text-xs mt-1.5`">{{ error }}</p>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <button
          :disabled="saving"
          :class="`flex-1 ${UI.primaryBg} ${UI.primaryBgHover} disabled:opacity-50 ${UI.textPrimary} text-sm font-medium rounded-lg px-4 py-2.5 transition-colors`"
          @click="handleSave"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button
          v-if="container.githubRepo"
          :disabled="saving"
          :class="`px-4 py-2.5 text-sm ${UI.errorText} ${UI.errorTextHover} disabled:opacity-50 border ${UI.borderSubtle} rounded-lg transition-colors`"
          @click="handleRemove"
        >
          Remove
        </button>
        <button
          :class="`px-4 py-2.5 text-sm ${UI.textSecondary} ${UI.textHover} border ${UI.borderSubtle} rounded-lg transition-colors`"
          @click="emit('close')"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>
