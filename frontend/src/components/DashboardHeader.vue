<script setup lang="ts">
import { Container, RefreshCw } from '@lucide/vue';
import { UI } from '../theme';

defineProps<{ containerCount: number; composeCount: number; refreshing: boolean }>();
const emit = defineEmits<{ refresh: [] }>();
</script>

<template>
  <header :class="`border-b ${UI.borderDefault} bg-gray-900/80 sticky top-0 z-20 backdrop-blur-sm`">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <div class="p-2 bg-blue-600/20 rounded-lg">
          <Container :size="20" :class="UI.primaryText" />
        </div>
        <div class="min-w-0">
          <h1 :class="`text-base font-semibold ${UI.textPrimary}`">Compose Watcher</h1>
          <p :class="`${UI.textMuted} text-xs truncate`">
            {{ containerCount }} containers across {{ composeCount }} Compose files
          </p>
        </div>
      </div>
      <button
        :disabled="refreshing"
        :class="`flex items-center gap-2 ${UI.inputBg} hover:bg-gray-700 disabled:opacity-50 border ${UI.borderSubtle} rounded-lg px-3 py-2 text-sm`"
        @click="emit('refresh')"
      >
        <RefreshCw :size="14" :class="refreshing ? 'animate-spin' : ''" />
        {{ refreshing ? 'Checking…' : 'Refresh' }}
      </button>
    </div>
  </header>
</template>
