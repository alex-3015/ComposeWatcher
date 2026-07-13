<script setup lang="ts">
import { ref, computed, useId } from 'vue';
import { ChevronDown } from '@lucide/vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { UI } from '../theme';

const props = defineProps<{
  releaseNotes: string | null;
  releaseName: string | null;
}>();

const expanded = ref(false);
const contentId = useId();

const sanitizedHtml = computed(() => {
  if (!props.releaseNotes) return '';
  const raw = marked.parse(props.releaseNotes, { async: false }) as string;
  return DOMPurify.sanitize(raw);
});
</script>

<template>
  <div v-if="releaseNotes" :class="`border ${UI.borderDefault} rounded-lg overflow-hidden`">
    <button
      :aria-expanded="expanded"
      :aria-controls="contentId"
      :class="`w-full flex items-center gap-2 px-3 py-2 text-xs ${UI.textSecondary} hover:text-gray-200 transition-colors ${UI.inputBg}`"
      @click="expanded = !expanded"
    >
      <ChevronDown
        :size="14"
        :class="`transition-transform shrink-0 ${expanded ? '' : '-rotate-90'}`"
        aria-hidden="true"
      />
      <span class="truncate">
        {{ releaseName ?? 'Release Notes' }}
      </span>
    </button>
    <div
      v-show="expanded"
      :id="contentId"
      class="release-notes-content px-3 py-3 text-sm leading-relaxed"
    >
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-html="sanitizedHtml" />
    </div>
  </div>
</template>

<style scoped>
.release-notes-content {
  color: var(--color-gray-300);
}
.release-notes-content :deep(h1),
.release-notes-content :deep(h2),
.release-notes-content :deep(h3) {
  color: var(--color-white);
  font-weight: 600;
  margin-top: 1em;
  margin-bottom: 0.5em;
}
.release-notes-content :deep(h1) {
  font-size: 1.1em;
}
.release-notes-content :deep(h2) {
  font-size: 1em;
}
.release-notes-content :deep(h3) {
  font-size: 0.95em;
}
.release-notes-content :deep(p) {
  margin-bottom: 0.5em;
}
.release-notes-content :deep(ul),
.release-notes-content :deep(ol) {
  padding-left: 1.5em;
  margin-bottom: 0.5em;
}
.release-notes-content :deep(ul) {
  list-style: disc;
}
.release-notes-content :deep(ol) {
  list-style: decimal;
}
.release-notes-content :deep(code) {
  background: var(--color-gray-800);
  padding: 0.15em 0.4em;
  border-radius: 0.25em;
  font-size: 0.9em;
}
.release-notes-content :deep(pre) {
  background: var(--color-gray-800);
  padding: 0.75em 1em;
  border-radius: 0.5em;
  overflow-x: auto;
  margin-bottom: 0.75em;
}
.release-notes-content :deep(pre code) {
  background: none;
  padding: 0;
}
.release-notes-content :deep(a) {
  color: var(--color-blue-400);
  text-decoration: underline;
}
.release-notes-content :deep(a:hover) {
  color: var(--color-blue-300);
}
</style>
