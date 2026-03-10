<script setup lang="ts">
import type { ContainerInfo } from '../types';
import { STATUS_THEME } from '../theme';

const props = defineProps<{ status: ContainerInfo['status'] }>();
</script>

<template>
  <span
    :class="`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
      ${STATUS_THEME[props.status].bgBadge}
      ${STATUS_THEME[props.status].text}
      ${STATUS_THEME[props.status].borderBadge}`"
  >
    {{ STATUS_THEME[props.status].badgeLabel }}
  </span>
</template>
