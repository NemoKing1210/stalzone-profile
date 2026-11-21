<script setup lang="ts">
import { storeToRefs } from 'pinia';

import { useAssistantPanelStore } from '~/stores/assistantPanel';
import { useChatStore } from '~/stores/chat';
import ChatConversation from './ChatConversation.vue';

const panel = useAssistantPanelStore();
const chat = useChatStore();
const { threads, activeThreadId, activeThread, sending, pending } = storeToRefs(chat);
const { t } = useI18n();
const conversation = ref<{ focus: () => void } | null>(null);

const threadItems = computed(() => threads.value.map((thread) => ({ label: thread.title, value: thread.id })));
const currentThreadItem = computed(() => threadItems.value.find((item) => item.value === activeThreadId.value));
const showDot = computed(() => sending.value || pending.value != null);

watch(
  () => panel.open,
  async (open) => {
    if (!open) return;
    await chat.init();
    await nextTick();
    conversation.value?.focus();
  },
);

async function selectThread(value: unknown): Promise<void> {
  const id = typeof value === 'number' ? value : value && typeof value === 'object' && 'value' in value ? value.value : null;
  if (typeof id !== 'number') return;
  await chat.openThread(id);
  await nextTick();
  conversation.value?.focus();
}

async function startThread(): Promise<void> {
  chat.newThread();
  await nextTick();
  conversation.value?.focus();
}
</script>

<template>
  <USlideover
    :open="panel.open"
    side="right"
    :title="t('chat.panelTitle')"
    :description="activeThread?.title ?? t('chat.newTitle')"
    :close="{ color: 'neutral' }"
    :ui="{
      content:
        'z-50 w-[min(94vw,34rem)] !max-w-none border-l border-[var(--sz-border)] bg-ink-950 !shadow-none motion-reduce:animate-none motion-reduce:transition-none',
      header: 'flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2.5 min-h-0',
      wrapper: 'order-1 min-w-0 flex-1 pe-10',
      title: 'truncate',
      description: 'mt-0.5 truncate text-[11.5px] text-[var(--sz-text-muted)]',
      body: 'flex min-h-0 flex-1 flex-col overflow-hidden p-0',
    }"
    @update:open="(value: boolean) => (value ? panel.show() : panel.hide())"
  >
    <template #title>
      <span class="inline-flex min-w-0 items-center gap-1.5">
        <span class="relative inline-flex">
          <UIcon name="i-lucide-sparkles" class="size-4 shrink-0 text-[var(--sz-accent)]" aria-hidden="true" />
          <span
            v-if="showDot"
            class="absolute -right-1 -top-1 size-1.5 rounded-full bg-[var(--sz-accent)]"
            aria-hidden="true"
          />
        </span>
        <span class="truncate">{{ t('chat.panelTitle') }}</span>
      </span>
    </template>

    <template #actions>
      <div class="order-2 flex w-full min-w-0 items-center gap-1.5">
        <USelectMenu
          :model-value="currentThreadItem"
          :items="threadItems"
          size="sm"
          class="min-w-0 flex-1 max-sm:min-h-11"
          :placeholder="t('chat.threads')"
          :disabled="!threadItems.length"
          :search-input="false"
          :ui="{ content: 'z-[60]' }"
          :aria-label="t('chat.threads')"
          @update:model-value="selectThread"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-lucide-plus"
          :aria-label="t('chat.newThread')"
          :title="t('chat.newThread')"
          class="max-sm:size-11"
          @click="startThread"
        />
        <UButton
          to="/chat"
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-lucide-external-link"
          :aria-label="t('chat.fullChat')"
          :title="t('chat.fullChat')"
          class="shrink-0 sm:hidden max-sm:size-11"
          @click="panel.hide()"
        />
        <UButton
          to="/chat"
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-lucide-external-link"
          :label="t('chat.fullChat')"
          class="hidden shrink-0 sm:inline-flex"
          @click="panel.hide()"
        />
      </div>
    </template>

    <template #body>
      <div id="assistant-panel" class="flex h-full min-h-0 flex-col">
        <ChatConversation ref="conversation" class="h-full" />
      </div>
    </template>
  </USlideover>
</template>
