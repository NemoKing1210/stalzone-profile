<script setup lang="ts">
import type { ChatMessage, ChatPendingWrite, ChatThread, ChatThreadRead, ChatTurnResult } from '@profile/shared/contracts';
import { ProfilePane } from '~/shared/ui';

import ChatToolResult from './ChatToolResult.vue';

const { t } = useI18n();
const { message: apiMessage } = useApiError();
const { formatDate } = useFormat();
const toast = useToast();
const request = useRequestFetch();

useHead(() => ({ title: `${t('chat.pageTitle')} // ${t('common.appName')}` }));

const threads = ref<ChatThread[]>([]);
const activeThreadId = ref<number | null>(null);
const messages = ref<ChatMessage[]>([]);
const pending = ref<ChatPendingWrite | null>(null);
const draft = ref('');
const sending = ref(false);
const loadError = ref<string | null>(null);

const activeThread = computed(() => threads.value.find((thread) => thread.id === activeThreadId.value) ?? null);

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

async function loadThreads(): Promise<void> {
  threads.value = await request<ChatThread[]>('/api/v1/chat/threads');
}

async function openThread(id: number): Promise<void> {
  const read = await request<ChatThreadRead>(`/api/v1/chat/threads/${id}`);
  activeThreadId.value = read.thread.id;
  messages.value = read.messages;
  pending.value = null;
  loadError.value = null;
}

function newThread(): void {
  activeThreadId.value = null;
  messages.value = [];
  pending.value = null;
  loadError.value = null;
}

function apply(result: ChatTurnResult): void {
  activeThreadId.value = result.thread.id;
  messages.value = result.messages;
  pending.value = result.pending;
  loadError.value = result.error;
}

async function turn(body: Record<string, unknown>): Promise<void> {
  if (sending.value) return;
  sending.value = true;
  loadError.value = null;
  try {
    const result = await $fetch<ChatTurnResult>('/api/v1/chat/turn', {
      method: 'POST',
      body: { threadId: activeThreadId.value ?? undefined, ...body },
    });
    apply(result);
    await loadThreads();
  } catch (error) {
    const data =
      error && typeof error === 'object' && 'data' in error
        ? (error as { data?: { error?: { code?: string; message?: string } } }).data
        : undefined;
    toast.add({
      title: t('chat.failed'),
      description: apiMessage(data?.error?.code, data?.error?.message || t('chat.failedDescription')),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    });
  } finally {
    sending.value = false;
  }
}

async function send(): Promise<void> {
  const text = draft.value.trim();
  if (!text) return;
  draft.value = '';
  await turn({ message: text });
}

async function confirmPending(): Promise<void> {
  const write = pending.value;
  if (!write) return;
  pending.value = null;
  await turn({ message: t('chat.confirmed'), confirm: { toolName: write.toolName, args: write.args } });
}

async function declinePending(): Promise<void> {
  const write = pending.value;
  if (!write) return;
  pending.value = null;
  await turn({ message: t('chat.declined'), decline: { toolName: write.toolName } });
}

onMounted(() => {
  void loadThreads();
});
</script>

<template>
  <section class="space-y-4">
    <header class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1>{{ t('chat.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('chat.summary') }}</p>
      </div>
      <UButton icon="i-lucide-plus" :label="t('chat.newThread')" color="neutral" variant="outline" @click="newThread" />
    </header>

    <div class="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
      <ProfilePane :title="t('chat.threads')" dense>
        <p v-if="!threads.length" class="text-[12px] text-[var(--sz-text-dim)]">{{ t('chat.noThreads') }}</p>
        <ul v-else class="space-y-0.5">
          <li v-for="thread in threads" :key="thread.id">
            <button
              type="button"
              class="w-full border-l-2 px-2 py-1.5 text-left text-[12px] transition-colors"
              :class="
                thread.id === activeThreadId
                  ? 'border-[var(--sz-accent)] bg-[var(--sz-surface-alt)] text-[var(--sz-text)]'
                  : 'border-transparent text-[var(--sz-text-muted)] hover:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-text)]'
              "
              @click="openThread(thread.id)"
            >
              <span class="block truncate">{{ thread.title }}</span>
              <span class="mt-0.5 block text-[10px] text-[var(--sz-text-dim)]">{{ formatDate(thread.updatedAt) }}</span>
            </button>
          </li>
        </ul>
      </ProfilePane>

      <ProfilePane :title="activeThread?.title ?? t('chat.newTitle')" dense flush>
        <div class="flex h-[calc(100vh-18rem)] min-h-[380px] flex-col">
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
              <UButton size="xs" color="neutral" variant="ghost" :label="t('chat.decline')" @click="declinePending" />
              <UButton size="xs" :label="t('chat.confirm')" :loading="sending" @click="confirmPending" />
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
      </ProfilePane>
    </div>
  </section>
</template>
