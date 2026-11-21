<script setup lang="ts">
import { storeToRefs } from 'pinia';

import { useChatStore } from '~/stores/chat';
import ChatToolResult from './ChatToolResult.vue';

const chat = useChatStore();
const { messages, pending, sending, loadError } = storeToRefs(chat);
const { t } = useI18n();
const draft = ref('');
const root = ref<HTMLElement | null>(null);

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: { type: 'text'; text: string }[];
  metadata: { toolName?: string; payload?: unknown; tool?: boolean };
}

const uiMessages = computed<UiMessage[]>(() =>
  messages.value.map((message) => ({
    id: String(message.id),
    role: message.role === 'user' ? 'user' : 'assistant',
    parts: [{ type: 'text', text: message.role === 'tool' ? '' : message.content }],
    metadata: {
      tool: message.role === 'tool',
      toolName: message.toolName ?? undefined,
      payload: message.payload,
    },
  })),
);

async function send(): Promise<void> {
  const text = draft.value.trim();
  if (!text) return;
  draft.value = '';
  await chat.send(text);
}

/** The panel focuses the composer when it opens; the page does not need to. */
function focus(): void {
  root.value?.querySelector('textarea')?.focus();
}

defineExpose({ focus });
</script>

<template>
  <div ref="root" class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      <p v-if="!messages.length" class="py-10 text-center text-[12.5px] text-[var(--sz-text-dim)]">
        {{ t('chat.empty') }}
      </p>
      <UChatMessages v-else :messages="uiMessages as never" :auto-scroll="true">
        <template #content="{ message }">
          <ChatToolResult
            v-if="(message as unknown as UiMessage).metadata.tool"
            :tool-name="(message as unknown as UiMessage).metadata.toolName ?? 'tool'"
            :payload="(message as unknown as UiMessage).metadata.payload"
          />
          <span v-else class="whitespace-pre-wrap">{{ (message as unknown as UiMessage).parts[0]?.text }}</span>
        </template>
      </UChatMessages>
      <p v-if="loadError" class="mt-3 border border-[var(--sz-warning)] px-2.5 py-2 text-[12px] text-[var(--sz-warning-text)]">
        {{ loadError }}
      </p>
    </div>

    <div v-if="pending" class="border-t border-[var(--sz-border)] bg-[var(--sz-surface-alt)] p-2.5">
      <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('chat.pendingTitle') }} · {{ pending.toolName }}</p>
      <p class="mt-1 text-[12.5px]">{{ pending.human }}</p>
      <div class="mt-2 flex justify-end gap-2">
        <UButton size="xs" color="neutral" variant="ghost" :label="t('chat.decline')" @click="chat.declinePending" />
        <UButton size="xs" :label="t('chat.confirm')" :loading="sending" @click="chat.confirmPending" />
      </div>
    </div>

    <div class="border-t border-[var(--sz-border)] p-2">
      <UChatPrompt
        v-model="draft"
        :placeholder="t('chat.placeholder')"
        :loading="sending"
        :disabled="sending"
        @submit="send"
      />
    </div>
  </div>
</template>
