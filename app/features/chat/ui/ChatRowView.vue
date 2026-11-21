<script setup lang="ts">
import type { ChatAttachment } from '@profile/shared/contracts';
import { computed } from 'vue';

import { chatToolView } from '../model/render';
import type { ChatRow } from '../model/rows';
import ChatMessageRow from './ChatMessageRow.vue';
import ChatToolResult from './ChatToolResult.vue';

const props = defineProps<{ row: ChatRow | null }>();
const emit = defineEmits<{
  copy: [text: string];
  openImage: [file: ChatAttachment];
  openFile: [file: ChatAttachment];
}>();

const { t } = useI18n();

/** A payload with rows is worth showing at once; a plain acknowledgement stays folded. */
const hasData = computed(() => {
  if (!props.row || props.row.kind !== 'tools') return false;
  return props.row.runs.some((run) => chatToolView(run.name, run.payload).kind !== 'text');
});
</script>

<template>
  <ChatMessageRow
    v-if="props.row && props.row.kind !== 'tools'"
    :row="props.row"
    @copy="emit('copy', $event)"
    @open-image="emit('openImage', $event)"
    @open-file="emit('openFile', $event)"
  />

  <UChatTool
    v-else-if="props.row"
    variant="card"
    icon="i-lucide-wrench"
    :text="t('chat.toolsUsed', { count: props.row.runs.length })"
    :default-open="hasData"
    :ui="{
      root: 'rounded-none border border-[var(--sz-border)] bg-[var(--sz-surface-alt)]/40 ring-0',
      trigger: 'px-2 py-1',
      body: 'max-h-[360px] overflow-y-auto px-2 py-2',
      content: 'motion-reduce:animate-none',
    }"
  >
    <div class="space-y-2">
      <div v-for="run in props.row.runs" :key="run.id">
        <div class="mb-1 flex items-baseline gap-2">
          <span class="font-mono text-[11px] text-[var(--sz-text-muted)]">{{ run.name }}</span>
          <span v-if="run.status === 'declined'" class="text-[11px] text-[var(--sz-warning-text)]">
            {{ t('chat.toolDeclined') }}
          </span>
        </div>
        <ChatToolResult :tool-name="run.name" :payload="run.payload" />
      </div>
    </div>
  </UChatTool>
</template>
