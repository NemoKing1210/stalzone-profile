<script setup lang="ts">
import type { ChatItemRef } from '@profile/shared/contracts';
import { computed } from 'vue';

import { renderMarkdown } from '../model/markdown';

const props = defineProps<{ text: string; refs?: ChatItemRef[] }>();

/** `renderMarkdown` escapes raw HTML; this is the only place model text becomes DOM. */
const html = computed(() => renderMarkdown(props.text, props.refs ?? []));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- escaped by markdown-it's html:false -->
  <div class="sz-md" v-html="html" />
</template>
