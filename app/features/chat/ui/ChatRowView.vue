<script setup lang="ts">
import type { ChatAttachment } from '@profile/shared/contracts';

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
</script>

<template>
  <ChatMessageRow
    v-if="props.row && props.row.kind !== 'tools'"
    :row="props.row"
    @copy="emit('copy', $event)"
    @open-image="emit('openImage', $event)"
    @open-file="emit('openFile', $event)"
  />

  <div v-else-if="props.row" class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)]/40">
    <div class="border-b border-[var(--sz-border)] px-2 py-1">
      <span class="sz-caps text-[10px] text-[var(--sz-text-muted)]">
        {{ t('chat.toolsUsed', { count: props.row.runs.length }) }}
      </span>
    </div>
    <div
      v-for="run in props.row.runs"
      :key="run.id"
      class="border-b border-[var(--sz-border)] px-2 py-1.5 last:border-b-0"
    >
      <div class="mb-1 flex items-baseline gap-2">
        <span class="font-mono text-[11px] text-[var(--sz-text-muted)]">{{ run.name }}</span>
        <span v-if="run.status === 'declined'" class="text-[11px] text-[var(--sz-warning-text)]">
          {{ t('chat.toolDeclined') }}
        </span>
      </div>
      <ChatToolResult :tool-name="run.name" :payload="run.payload" />
    </div>
  </div>
</template>
