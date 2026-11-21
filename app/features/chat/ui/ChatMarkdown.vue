<script setup lang="ts">
import type { ChatItemRef } from '@profile/shared/contracts';
import { computed } from 'vue';

import { useItemModalStore } from '~/stores/itemModal';

import { chatItemFromEvent } from '../model/itemLinks';
import { renderMarkdown } from '../model/markdown';

const props = defineProps<{ text: string; refs?: ChatItemRef[] }>();
const itemModal = useItemModalStore();

/** `renderMarkdown` escapes raw HTML; this is the only place model text becomes DOM. */
const html = computed(() => renderMarkdown(props.text, props.refs ?? []));

/** An item chip opens the global modal in place; modified clicks stay with the browser. */
function openChip(event: MouseEvent): void {
  const target = chatItemFromEvent(event);
  if (!target) return;
  event.preventDefault();
  itemModal.openTarget(target);
}
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- escaped by markdown-it's html:false -->
  <div class="sz-md" @click="openChip" v-html="html" />
</template>
