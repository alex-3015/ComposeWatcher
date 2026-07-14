<script setup lang="ts">
import { computed } from 'vue';
import type { ContainerPresentationInput } from '../containerPresentation';
import { getContainerStatusPresentation } from '../containerPresentation';
import { STATUS_THEME } from '../theme';

const props = defineProps<{ container: ContainerPresentationInput }>();

const presentation = computed(() => getContainerStatusPresentation(props.container));
const theme = computed(() => STATUS_THEME[presentation.value.themeStatus]);
</script>

<template>
  <span
    :title="presentation.description ?? undefined"
    :class="`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
      ${theme.bgBadge}
      ${theme.text}
      ${theme.borderBadge}`"
  >
    {{ presentation.label }}
  </span>
</template>
