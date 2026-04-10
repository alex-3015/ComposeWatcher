<script setup lang="ts">
import { computed } from 'vue';
import type { ContainerInfo } from '../types';
import { STATUS_THEME } from '../theme';

const props = defineProps<{ status: ContainerInfo['status'] }>();

const theme = computed(() => STATUS_THEME[props.status] ?? STATUS_THEME['unknown']);
</script>

<template>
  <span
    :class="`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
      ${theme.bgBadge}
      ${theme.text}
      ${theme.borderBadge}`"
  >
    {{ theme.badgeLabel }}
  </span>
</template>
