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
}>();
</script>

<template>
  <div :class="`${bgClass} border ${borderClass} rounded-xl px-4 py-3 flex items-center gap-3`">
    <component :is="icon" :size="16" :class="`${textClass} shrink-0`" />
    <div>
      <p :class="`${UI.textPrimary} text-xl font-bold leading-none`">{{ count }}</p>
      <p :class="`${UI.textMuted} text-xs mt-0.5`">{{ label }}</p>
    </div>
  </div>
</template>
