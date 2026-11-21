<script setup lang="ts">
import type { ChatModel, ChatModelsResult, ChatSettingsRead } from '@profile/shared/contracts';
import { storeToRefs } from 'pinia';
import { ConfirmActionModal, ProfilePane } from '~/shared/ui';

import { useChatStore } from '~/stores/chat';
import { chatModelItems } from '../model/modelChoice';
import ChatConversation from './ChatConversation.vue';
import { useThreadDelete } from './useThreadDelete';

const { t } = useI18n();
const { formatDate } = useFormat();
const { write } = useWrite();
const request = useRequestFetch();

useHead(() => ({ title: `${t('chat.pageTitle')} // ${t('common.appName')}` }));

/** Threads, messages, pending confirmation and the in-flight turn live in the store. */
const chat = useChatStore();
const { threads, activeThreadId, sending, activeThread } = storeToRefs(chat);
const {
  target: deleteTarget,
  open: deleteOpen,
  busy: deleting,
  ask: askDelete,
  confirm: confirmDelete,
} = useThreadDelete();

/** The same audited `chat_settings.model` Settings -> Assistant writes; no per-thread model. */
const chatSettings = ref<ChatSettingsRead | null>(null);
const models = ref<ChatModel[]>([]);
const modelError = ref('');
const savingModel = ref(false);
let modelsRequest = 0;

const modelItems = computed(() => chatModelItems(chatSettings.value?.model, models.value));
const modelEnabled = computed(() => chatSettings.value?.enabled === true);
const currentModelItem = computed(() => modelItems.value.find((item) => item.value === chatSettings.value?.model));
const assistantBusy = computed(() => sending.value || savingModel.value);

/** Settings decide whether the selector is live; a missing key shows the settings link. */
async function loadAssistant(): Promise<void> {
  try {
    chatSettings.value = await request<ChatSettingsRead>('/api/v1/chat/settings');
  } catch {
    chatSettings.value = null;
    return;
  }
  if (chatSettings.value.enabled) await loadModels();
}

async function loadModels(): Promise<void> {
  const token = ++modelsRequest;
  modelError.value = '';
  try {
    const result = await $fetch<ChatModelsResult>('/api/v1/chat/models', { method: 'POST', body: {} });
    if (token !== modelsRequest) return;
    if (!result.ok) {
      modelError.value = result.message;
      return;
    }
    models.value = result.models;
  } catch {
    if (token === modelsRequest) modelError.value = t('chat.modelsFallback');
  }
}

/** The list value is updated only after the audited PATCH succeeds; a failure keeps the old id. */
async function selectModel(value: unknown): Promise<void> {
  const id = typeof value === 'string' ? value : value && typeof value === 'object' && 'value' in value ? value.value : '';
  const current = chatSettings.value?.model;
  if (!id || typeof id !== 'string' || !current || id === current || savingModel.value || sending.value) return;
  savingModel.value = true;
  try {
    const result = await write<{ dryRun: boolean }>('/api/v1/chat/settings', {
      method: 'PATCH',
      body: { model: id, dryRun: false },
      silent: true,
      reconcile: 'none',
    });
    if (result && chatSettings.value) chatSettings.value = { ...chatSettings.value, model: id };
  } finally {
    savingModel.value = false;
  }
}

onMounted(() => {
  void chat.init();
  void loadAssistant();
});
</script>

<template>
  <section class="space-y-4">
    <header class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1>{{ t('chat.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('chat.summary') }}</p>
      </div>
      <div class="flex flex-col items-end gap-1">
        <div class="flex flex-wrap items-center justify-end gap-2">
          <template v-if="chatSettings">
            <USelectMenu
              v-if="modelEnabled"
              :model-value="currentModelItem"
              :items="modelItems"
              create-item="always"
              size="sm"
              class="w-52 max-w-full"
              :loading="savingModel"
              :disabled="assistantBusy"
              :placeholder="t('chat.modelPlaceholder')"
              :aria-label="t('chat.modelLabel')"
              @update:model-value="selectModel"
            />
            <template v-else>
              <USelectMenu
                :model-value="currentModelItem"
                :items="modelItems"
                size="sm"
                class="w-52 max-w-full"
                disabled
                :aria-label="t('chat.modelLabel')"
              />
              <UButton
                to="/settings?tab=assistant"
                size="sm"
                color="neutral"
                variant="link"
                icon="i-lucide-settings-2"
                :label="t('chat.modelOpenSettings')"
              />
            </template>
          </template>
          <UButton
            icon="i-lucide-plus"
            :label="t('chat.newThread')"
            color="neutral"
            variant="outline"
            @click="chat.newThread"
          />
        </div>
        <p v-if="modelError" class="max-w-72 text-right text-[11px] text-[var(--sz-warning-text)]">
          {{ modelError }}
        </p>
      </div>
    </header>

    <div class="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
      <ProfilePane :title="t('chat.threads')" dense>
        <p v-if="!threads.length" class="text-[12px] text-[var(--sz-text-dim)]">{{ t('chat.noThreads') }}</p>
        <ul v-else class="space-y-0.5">
          <li v-for="thread in threads" :key="thread.id" class="flex items-stretch">
            <button
              type="button"
              class="min-w-0 flex-1 border-l-2 px-2 py-1.5 text-left text-[12px] transition-colors"
              :class="
                thread.id === activeThreadId
                  ? 'border-[var(--sz-accent)] bg-[var(--sz-surface-alt)] text-[var(--sz-text)]'
                  : 'border-transparent text-[var(--sz-text-muted)] hover:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-text)]'
              "
              @click="chat.openThread(thread.id)"
            >
              <span class="block truncate">{{ thread.title }}</span>
              <span class="mt-0.5 block text-[10px] text-[var(--sz-text-dim)]">{{ formatDate(thread.updatedAt) }}</span>
            </button>
            <button
              type="button"
              class="flex w-7 shrink-0 items-center justify-center border-l-2 border-transparent text-[var(--sz-text-dim)] transition-colors hover:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-warning-text)] disabled:opacity-40"
              :disabled="sending"
              :aria-label="t('chat.deleteThreadName', { title: thread.title })"
              :title="t('chat.deleteThread')"
              @click="askDelete(thread)"
            >
              <UIcon name="i-lucide-trash-2" class="size-3.5" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </ProfilePane>

      <ProfilePane :title="activeThread?.title ?? t('chat.newTitle')" dense flush>
        <ChatConversation class="h-[calc(100vh-18rem)] min-h-[380px]" />
      </ProfilePane>
    </div>

    <ConfirmActionModal
      v-model:open="deleteOpen"
      :title="t('chat.deleteThreadTitle')"
      :description="deleteTarget ? t('chat.deleteThreadText', { title: deleteTarget.title }) : ''"
      :confirm-label="t('chat.deleteThreadConfirm')"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </section>
</template>
