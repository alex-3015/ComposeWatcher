<script setup lang="ts">
import { computed } from 'vue';
import { ChevronDown, FolderOpen } from '@lucide/vue';
import type { ContainerInfo } from '../types';
import ContainerCard from './ContainerCard.vue';
import { UI } from '../theme';

const props = defineProps<{
  composeFile: string;
  containers: ContainerInfo[];
  counts: { breaking: number; updates: number; total: number };
  expanded: boolean;
}>();

const groupId = computed(
  () => `compose-group-${props.composeFile.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
);

const emit = defineEmits<{
  toggle: [];
  linkRepo: [container: ContainerInfo];
}>();
</script>

<template>
  <div>
    <button
      :aria-expanded="expanded"
      :aria-controls="groupId"
      :class="`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${UI.cardBg} border ${UI.borderDefault} hover:border-gray-700 transition-colors mb-3`"
      @click="emit('toggle')"
    >
      <ChevronDown
        :size="16"
        :class="`${UI.textSecondary} transition-transform shrink-0 ${expanded ? '' : '-rotate-90'}`"
        aria-hidden="true"
      />
      <FolderOpen :size="16" :class="`${UI.textSecondary} shrink-0`" aria-hidden="true" />
      <span :class="`font-mono text-sm ${UI.textPrimary} truncate`">{{ composeFile }}</span>
      <div class="flex items-center gap-2 ml-auto shrink-0">
        <span
          v-if="counts.breaking > 0"
          class="text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5"
        >
          {{ counts.breaking }} breaking
        </span>
        <span
          v-if="counts.updates > 0"
          class="text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5"
        >
          {{ counts.updates }} update{{ counts.updates !== 1 ? 's' : '' }}
        </span>
        <span :class="`text-xs ${UI.textMuted}`">
          {{ counts.total }} container{{ counts.total !== 1 ? 's' : '' }}
        </span>
      </div>
    </button>
    <div
      v-show="expanded"
      :id="groupId"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6"
    >
      <ContainerCard
        v-for="c in containers"
        :key="c.id"
        :container="c"
        @link-repo="emit('linkRepo', $event)"
      />
    </div>
  </div>
</template>
