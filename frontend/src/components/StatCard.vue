<script setup lang="ts">
import type { Component } from 'vue';
import { UI } from '../theme';

defineProps<{
  icon: Component;
  count: number;
  label: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  active?: boolean;
}>();

defineEmits<{ select: [] }>();
</script>

<template>
  <button
    type="button"
    :aria-pressed="active"
    :class="`${bgClass} border ${borderClass} rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${active ? 'ring-2 ring-blue-500/50' : ''}`"
    @click="$emit('select')"
  >
    <component :is="icon" :size="16" :class="`${textClass} shrink-0`" aria-hidden="true" />
    <div>
      <p :class="`${UI.textPrimary} text-xl font-bold leading-none`">{{ count }}</p>
      <p :class="`${UI.textMuted} text-xs mt-0.5`">{{ label }}</p>
    </div>
  </button>
</template>
