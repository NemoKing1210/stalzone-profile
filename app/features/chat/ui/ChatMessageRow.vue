<script setup lang="ts">
import type { ChatAttachment } from '@profile/shared/contracts';
import { computed } from 'vue';

import type { ChatRow } from '../model/rows';
import ChatAttachmentGrid from './ChatAttachmentGrid.vue';
import ChatMarkdown from './ChatMarkdown.vue';

type MessageRow = Extract<ChatRow, { kind: 'user' | 'assistant' }>;

const props = defineProps<{ row: MessageRow }>();
const emit = defineEmits<{
  copy: [text: string];
  openImage: [file: ChatAttachment];
  openFile: [file: ChatAttachment];
}>();

const { t, locale } = useI18n();

const time = computed(() => {
  const date = new Date(props.row.createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
});
</script>

<template>
  <article v-if="row.kind === 'user'" class="flex w-full justify-end">
    <div class="w-fit max-w-[88%] border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2.5 py-2">
      <ChatAttachmentGrid
        :attachments="row.attachments"
        @open-image="emit('openImage', $event)"
        @open-file="emit('openFile', $event)"
      />
      <p v-if="row.text" class="whitespace-pre-wrap break-words text-[13px]">{{ row.text }}</p>
      <p v-if="time" class="mt-1 whitespace-nowrap text-right text-[10px] tabular-nums text-[var(--sz-text-dim)]">
        <time :datetime="row.createdAt">{{ time }}</time>
      </p>
    </div>
  </article>

  <article v-else class="group">
    <div class="mb-1 flex items-baseline gap-2">
      <span class="sz-caps text-[10px] text-[var(--sz-text-muted)]">{{ t('chat.roleAssistant') }}</span>
      <span v-if="time" class="text-[10px] tabular-nums text-[var(--sz-text-dim)]">
        <time :datetime="row.createdAt">{{ time }}</time>
      </span>
    </div>
    <UChatReasoning
      v-if="row.reasoning"
      :text="row.reasoning"
      :duration="row.meta?.durationMs == null ? undefined : Math.round(row.meta.durationMs / 1000)"
    />
    <ChatMarkdown :text="row.text" />
    <div class="mt-1 flex items-center justify-between gap-2">
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-copy"
        class="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
        :aria-label="t('chat.copyMessage')"
        @click="emit('copy', row.text)"
      />
      <p v-if="row.meta?.model || row.meta?.usage?.total" class="flex items-baseline gap-1.5 truncate text-[10px] text-[var(--sz-text-dim)]">
        <span v-if="row.meta?.model" class="font-mono">{{ row.meta.model }}</span>
        <span v-if="row.meta?.usage?.total" aria-hidden="true">·</span>
        <span v-if="row.meta?.usage?.total">
          {{ t('chat.tokenUsage', { count: row.meta.usage.total }) }}
        </span>
      </p>
    </div>
  </article>
</template>
