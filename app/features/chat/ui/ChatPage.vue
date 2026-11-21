<script setup lang="ts">
import {
  CHAT_PROVIDER_META,
  type ChatModel,
  type ChatModelsResult,
  type ChatSettingsRead,
} from '@profile/shared/contracts';
import { storeToRefs } from 'pinia';
import { ConfirmActionModal, ProfilePane } from '~/shared/ui';

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

function openThread(id: number): void {
  mobileThreadsOpen.value = false;
  void chat.openThread(id);
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
          <span class="inline-flex min-w-0 items-center gap-1.5" :title="providerDetail">
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
              :loading="refreshing"
              :disabled="!modelEnabled || sending"
              :aria-label="t('chat.providerRefresh')"
              :title="t('chat.providerRefresh')"
              @click="checkProvider"
            />
          </span>
          <UButton
            icon="i-lucide-panel-left"
            :label="t('chat.threads')"
            color="neutral"
            variant="ghost"
            class="lg:hidden"
            :aria-label="t('chat.threads')"
            @click="mobileThreadsOpen = true"
          />
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

    <div class="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
      <ProfilePane :title="t('chat.threads')" dense class="hidden lg:block">
        <ChatThreadList
          v-model:query="threadQuery"
          :threads="visibleThreads"
          :active-thread-id="activeThreadId"
          :disabled="sending"
          @open="openThread"
          @delete="askDelete"
        />
      </ProfilePane>

      <ProfilePane :title="activeThread?.title ?? t('chat.newTitle')" dense flush>
        <ChatConversation class="h-[calc(100dvh-21.5rem)] min-h-[320px] lg:h-[calc(100dvh-18rem)]" />
      </ProfilePane>
    </div>

    <USlideover v-model:open="mobileThreadsOpen" side="left" :title="t('chat.threads')">
      <template #body>
        <ChatThreadList
          v-model:query="threadQuery"
          :threads="visibleThreads"
          :active-thread-id="activeThreadId"
          :disabled="sending"
          @open="openThread"
          @delete="askDelete"
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
