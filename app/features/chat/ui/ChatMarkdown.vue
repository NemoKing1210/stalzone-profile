<script setup lang="ts">
import { computed } from 'vue';

import { renderMarkdown } from '../model/markdown';

const props = defineProps<{ text: string }>();

/** `renderMarkdown` escapes raw HTML; this is the only place model text becomes DOM. */
const html = computed(() => renderMarkdown(props.text));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- escaped by markdown-it's html:false -->
  <div class="sz-md" v-html="html" />
</template>
