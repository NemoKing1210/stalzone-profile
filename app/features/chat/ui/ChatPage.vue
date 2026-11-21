<script setup lang="ts">
import {
  CHAT_PROVIDER_META,
  type ChatModel,
  type ChatModelsResult,
  type ChatSettingsRead,
} from '@profile/shared/contracts';
import { storeToRefs } from 'pinia';
import { ConfirmActionModal } from '~/shared/ui';

import { useChatStore } from '~/stores/chat';
import { chatModelItems } from '../model/modelChoice';
import { chatProviderState, type ChatProviderState } from '../model/providerStatus';
import { filterThreads } from '../model/threadList';
import ChatConversation from './ChatConversation.vue';
import ChatThreadList from './ChatThreadList.vue';
import { useThreadDelete } from './useThreadDelete';

const { t } = useI18n();
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

/** Search and the day buckets are view state; the store keeps the canonical order. */
const threadQuery = ref('');
const visibleThreads = computed(() => filterThreads(threads.value, threadQuery.value));
const mobileThreadsOpen = ref(false);
const conversation = ref<{ focus: () => void } | null>(null);

function openThread(id: number): void {
  mobileThreadsOpen.value = false;
  void chat.openThread(id);
}

async function startThread(): Promise<void> {
  mobileThreadsOpen.value = false;
  chat.newThread();
  await nextTick();
  conversation.value?.focus();
}

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

/** The header badge is the last real provider answer; a timer re-probes while the page is open. */
const probeOutcome = ref<{ ok: boolean; message: string; count: number } | null>(null);
const probing = ref(false);
const refreshing = ref(false);
const providerState = computed(() => chatProviderState(chatSettings.value, probeOutcome.value));
const providerLabel = computed(() => (chatSettings.value ? CHAT_PROVIDER_META[chatSettings.value.provider].label : ''));

const PROVIDER_LABELS: Record<ChatProviderState, string> = {
  online: 'chat.providerOnline',
  error: 'chat.providerOffline',
  disabled: 'chat.providerDisabled',
  checking: 'chat.providerChecking',
  unknown: 'chat.providerUnknown',
};
const PROVIDER_TONES: Record<ChatProviderState, { dot: string; text: string }> = {
  online: { dot: 'bg-[var(--sz-success)]', text: 'text-[var(--sz-success-text)]' },
  error: { dot: 'bg-[var(--sz-danger)]', text: 'text-[var(--sz-danger-text)]' },
  disabled: { dot: 'bg-[var(--sz-warning)]', text: 'text-[var(--sz-warning-text)]' },
  checking: { dot: 'bg-[var(--sz-text-dim)]', text: 'text-[var(--sz-text-muted)]' },
  unknown: { dot: 'bg-[var(--sz-text-dim)]', text: 'text-[var(--sz-text-dim)]' },
};
const providerStateLabel = computed(() => t(PROVIDER_LABELS[providerState.value]));
const providerTone = computed(() => PROVIDER_TONES[providerState.value]);
const providerDetail = computed(() => {
  const provider = providerLabel.value;
  switch (providerState.value) {
    case 'online': {
      const count = probeOutcome.value?.count ?? 0;
      return count > 0
        ? t('chat.providerOnlineDetail', { provider, count })
        : t('chat.providerConnectedDetail', { provider });
    }
    case 'error':
      return probeOutcome.value?.message || t('chat.providerUnknownDetail');
    case 'disabled':
      return t('chat.providerDisabledDetail', { env: chatSettings.value?.apiKeyEnvResolved ?? '' });
    case 'checking':
      return t('chat.providerCheckingDetail', { provider });
    default:
      return t('chat.providerUnknownDetail');
  }
});

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

/** One real provider GET: it fills the model picker and the header status; never writes. */
async function loadModels(): Promise<void> {
  const token = ++modelsRequest;
  modelError.value = '';
  probing.value = true;
  try {
    const result = await $fetch<ChatModelsResult>('/api/v1/chat/models', { method: 'POST', body: {} });
    if (token !== modelsRequest) return;
    probeOutcome.value = { ok: result.ok, message: result.message, count: result.models.length };
    if (!result.ok) {
      modelError.value = result.message;
      return;
    }
    models.value = result.models;
  } catch {
    if (token !== modelsRequest) return;
    probeOutcome.value = { ok: false, message: '', count: 0 };
    modelError.value = t('chat.modelsFallback');
  } finally {
    if (token === modelsRequest) probing.value = false;
  }
}

async function checkProvider(): Promise<void> {
  if (!modelEnabled.value || sending.value || probing.value) return;
  refreshing.value = true;
  try {
    await loadModels();
  } finally {
    refreshing.value = false;
  }
}

/** A connected chat is still worth polling: a provider can fail mid-session without a turn. */
const PROVIDER_POLL_MS = 60_000;
let probeTimer: ReturnType<typeof setInterval> | null = null;
onBeforeUnmount(() => {
  if (probeTimer) clearInterval(probeTimer);
  probeTimer = null;
});

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
  probeTimer = setInterval(() => {
    if (!modelEnabled.value || sending.value || probing.value || document.visibilityState !== 'visible') return;
    void loadModels();
  }, PROVIDER_POLL_MS);
});
</script>

<template>
  <section class="flex h-[calc(100dvh-3rem)] min-h-0 flex-col lg:h-dvh">
    <h1 class="sr-only">{{ t('chat.title') }}</h1>

    <div class="flex min-h-0 flex-1">
      <!-- Second navigation level: the thread rail docked to the site rail, sharing its ink. -->
      <aside
        class="hidden w-60 shrink-0 flex-col border-r border-[var(--sz-border)] bg-ink-950 lg:flex xl:w-[17rem]"
        :aria-label="t('chat.threads')"
      >
        <div class="flex min-h-12 shrink-0 items-center gap-2 border-b border-[var(--sz-border)] px-3">
          <UIcon
            name="i-lucide-message-square-text"
            class="size-4 shrink-0 text-[var(--sz-text-muted)]"
            aria-hidden="true"
          />
          <h2 class="sz-caps truncate text-[var(--sz-text-muted)]">{{ t('chat.threads') }}</h2>
          <span class="ms-auto shrink-0 text-[11px] tabular-nums text-[var(--sz-text-dim)]">
            <span class="sr-only">{{ t('chat.threadCount', { count: threads.length }) }}</span>
            <span aria-hidden="true">{{ threads.length }}</span>
          </span>
        </div>

        <ChatThreadList
          v-model:query="threadQuery"
          class="min-h-0 flex-1"
          :threads="visibleThreads"
          :has-threads="threads.length > 0"
          :active-thread-id="activeThreadId"
          :disabled="sending"
          @open="openThread"
          @delete="askDelete"
          @create="startThread"
        />
      </aside>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--sz-surface)]">
        <header class="shrink-0 border-b border-[var(--sz-border)] bg-ink-950">
          <div class="mx-auto flex min-h-12 w-full max-w-[52rem] items-center gap-2 px-3 lg:px-4 lg:pe-24">
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-lucide-panel-left"
              class="shrink-0 lg:hidden max-sm:size-11"
              :aria-label="t('chat.threads')"
              @click="mobileThreadsOpen = true"
            />
            <div class="min-w-0 flex-1">
              <p class="sz-caps text-[var(--sz-text-dim)]">{{ t('chat.panelTitle') }}</p>
              <h2
                class="truncate text-[13px] font-medium normal-case leading-tight tracking-normal text-[var(--sz-text)]"
                :title="activeThread?.title ?? t('chat.newTitle')"
              >
                {{ activeThread?.title ?? t('chat.newTitle') }}
              </h2>
            </div>
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-lucide-plus"
              class="shrink-0 lg:hidden max-sm:size-11"
              :aria-label="t('chat.newThread')"
              :title="t('chat.newThread')"
              @click="startThread"
            />
          </div>
        </header>

        <div class="shrink-0 border-b border-[var(--sz-border)] bg-ink-950">
          <div class="mx-auto flex w-full max-w-[52rem] flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 lg:px-4">
            <template v-if="chatSettings">
              <USelectMenu
                v-if="modelEnabled"
                :model-value="currentModelItem"
                :items="modelItems"
                create-item="always"
                size="sm"
                class="w-52 max-w-full max-sm:w-full"
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
                  class="w-52 max-w-full max-sm:w-full"
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
            <span class="inline-flex min-w-0 items-center gap-1.5 max-sm:min-h-11" :title="providerDetail">
              <span class="size-1.5 shrink-0 rounded-full" :class="providerTone.dot" aria-hidden="true" />
              <span v-if="providerLabel" class="max-w-36 truncate text-[11px] text-[var(--sz-text-muted)]">
                {{ providerLabel }}
              </span>
              <span class="text-[11px]" :class="providerTone.text" role="status">{{ providerStateLabel }}</span>
              <UButton
                icon="i-lucide-refresh-cw"
                size="xs"
                color="neutral"
                variant="ghost"
                class="max-sm:size-11"
                :loading="refreshing"
                :disabled="!modelEnabled || sending"
                :aria-label="t('chat.providerRefresh')"
                :title="t('chat.providerRefresh')"
                @click="checkProvider"
              />
            </span>
            <p v-if="modelError" class="w-full text-[11px] text-[var(--sz-warning-text)]">{{ modelError }}</p>
          </div>
        </div>

        <ChatConversation ref="conversation" standalone class="min-h-0 flex-1" />
      </div>
    </div>

    <USlideover
      v-model:open="mobileThreadsOpen"
      side="left"
      :title="t('chat.threads')"
      :ui="{
        content: 'w-[min(88vw,20rem)] max-w-none border-r border-[var(--sz-border)] bg-ink-950',
        header: 'min-h-12 border-b border-[var(--sz-border)] px-3 py-2',
        body: 'flex min-h-0 flex-1 flex-col p-0',
      }"
    >
      <template #body>
        <ChatThreadList
          v-model:query="threadQuery"
          class="min-h-0 flex-1"
          :threads="visibleThreads"
          :has-threads="threads.length > 0"
          :active-thread-id="activeThreadId"
          :disabled="sending"
          @open="openThread"
          @delete="askDelete"
          @create="startThread"
        />
      </template>
    </USlideover>

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
