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
        'z-50 w-[min(94vw,27rem)] !max-w-none border-l border-[var(--sz-border)] bg-ink-950 !shadow-none motion-reduce:animate-none motion-reduce:transition-none',
      header: 'gap-2 p-2',
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
      <div class="flex min-w-0 flex-wrap items-center justify-end gap-1">
        <USelectMenu
          :model-value="currentThreadItem"
          :items="threadItems"
          size="xs"
          class="w-28"
          :aria-label="t('chat.threads')"
          @update:model-value="selectThread"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-plus"
          :aria-label="t('chat.newThread')"
          :title="t('chat.newThread')"
          @click="startThread"
        />
        <UButton
          to="/chat"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-external-link"
          :label="t('chat.fullChat')"
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
