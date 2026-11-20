<script setup lang="ts">
import type { ChatProvider, ChatPrompt, ChatPromptRead, ChatSettingsRead, ChatTestResult } from '@profile/shared/contracts';
import { CHAT_PROVIDERS } from '@profile/shared/contracts';

const { t } = useI18n();
const { write, busy } = useWrite();
const request = useRequestFetch();
const toast = useToast();

const settings = ref<ChatSettingsRead | null>(null);
const prompts = ref<ChatPromptRead | null>(null);
const promptDrafts = reactive<Record<number, string>>({});
const testing = ref(false);
const testResult = ref<ChatTestResult | null>(null);

const form = reactive({
  provider: 'openai' as ChatProvider,
  baseUrl: '',
  model: 'gpt-4.1-mini',
  temperature: 0.2,
  maxTokens: 2048,
  reasoningEffort: 'none' as 'none' | 'low' | 'medium' | 'high',
  timeoutMs: 30000,
  retries: 1,
  readToolAllowList: '',
  dataScopePrices: false,
  dataScopeLogs: false,
  apiKeyEnv: '',
});

const providerItems = computed(() =>
  CHAT_PROVIDERS.map((provider) => ({ label: t(`settings.assistant.providers.${provider}`), value: provider })),
);
const effortItems = computed(() => [
  { label: t('settings.assistant.effortNone'), value: 'none' },
  { label: t('settings.assistant.effortLow'), value: 'low' },
  { label: t('settings.assistant.effortMedium'), value: 'medium' },
  { label: t('settings.assistant.effortHigh'), value: 'high' },
]);

async function load(): Promise<void> {
  settings.value = await request<ChatSettingsRead>('/api/v1/chat/settings');
  prompts.value = await request<ChatPromptRead>('/api/v1/chat/prompts');
  for (const prompt of prompts.value.prompts) promptDrafts[prompt.promptId] = prompt.body;
  Object.assign(form, {
    provider: settings.value.provider,
    baseUrl: settings.value.baseUrl ?? '',
    model: settings.value.model,
    temperature: settings.value.temperature,
    maxTokens: settings.value.maxTokens,
    reasoningEffort: settings.value.reasoningEffort ?? 'none',
    timeoutMs: settings.value.timeoutMs,
    retries: settings.value.retries,
    readToolAllowList: settings.value.readToolAllowList.join(', '),
    dataScopePrices: settings.value.dataScopePrices,
    dataScopeLogs: settings.value.dataScopeLogs,
    apiKeyEnv: settings.value.apiKeyEnv ?? '',
  });
}

onMounted(() => {
  void load();
});

function body(): Record<string, unknown> {
  return {
    provider: form.provider,
    baseUrl: form.baseUrl.trim() === '' ? null : form.baseUrl.trim(),
    model: form.model.trim(),
    temperature: form.temperature,
    maxTokens: form.maxTokens,
    reasoningEffort: form.reasoningEffort === 'none' ? null : form.reasoningEffort,
    timeoutMs: form.timeoutMs,
    retries: form.retries,
    readToolAllowList: form.readToolAllowList
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
    dataScopePrices: form.dataScopePrices,
    dataScopeLogs: form.dataScopeLogs,
    apiKeyEnv: form.apiKeyEnv.trim() === '' ? null : form.apiKeyEnv.trim(),
  };
}

async function save(): Promise<void> {
  const result = await write<{ dryRun: boolean; diff: { human: string } }>('/api/v1/chat/settings', {
    method: 'PATCH',
    body: { ...body(), dryRun: false },
  });
  if (result) {
    await load();
    toast.add({ title: t('settings.assistant.saved'), color: 'success', icon: 'i-lucide-check' });
  }
}

async function testConnection(): Promise<void> {
  testing.value = true;
  testResult.value = null;
  try {
    testResult.value = await $fetch<ChatTestResult>('/api/v1/chat/test', {
      method: 'POST',
      body: {
        provider: form.provider,
        baseUrl: form.baseUrl.trim() === '' ? null : form.baseUrl.trim(),
        model: form.model.trim(),
        timeoutMs: form.timeoutMs,
      },
    });
  } catch (error) {
    const data =
      error && typeof error === 'object' && 'data' in error
        ? (error as { data?: { error?: { message?: string } } }).data
        : undefined;
    testResult.value = {
      ok: false,
      provider: form.provider,
      status: null,
      message: data?.error?.message ?? t('settings.assistant.testFailed'),
    };
  } finally {
    testing.value = false;
  }
}

async function savePrompt(prompt: ChatPrompt): Promise<void> {
  const result = await write('/api/v1/chat/prompts', {
    method: 'PATCH',
    body: {
      kind: prompt.kind,
      name: prompt.name,
      body: promptDrafts[prompt.promptId] ?? prompt.body,
      enabled: prompt.enabled,
      dryRun: false,
    },
  });
  if (result) {
    await load();
    toast.add({ title: t('settings.assistant.promptSaved'), color: 'success', icon: 'i-lucide-check' });
  }
}

async function togglePrompt(prompt: ChatPrompt): Promise<void> {
  await write('/api/v1/chat/prompts', {
    method: 'PATCH',
    body: { kind: prompt.kind, name: prompt.name, body: prompt.body, enabled: !prompt.enabled, dryRun: false },
  });
  await load();
}
</script>

<template>
  <section class="space-y-4">
    <p class="text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
      {{ t('settings.assistant.intro') }}
    </p>

    <UForm :state="form" class="space-y-4" @submit="save">
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField :label="t('settings.assistant.provider')" name="provider">
          <USelect v-model="form.provider" :items="providerItems" class="w-full" />
        </UFormField>
        <UFormField :label="t('settings.assistant.model')" name="model">
          <UInput v-model="form.model" class="w-full" />
        </UFormField>
        <UFormField :label="t('settings.assistant.baseUrl')" name="baseUrl">
          <UInput v-model="form.baseUrl" :placeholder="t('settings.assistant.baseUrlPlaceholder')" class="w-full" />
        </UFormField>
        <UFormField :label="t('settings.assistant.apiKeyEnv')" name="apiKeyEnv">
          <UInput v-model="form.apiKeyEnv" :placeholder="t('settings.assistant.apiKeyEnvPlaceholder')" class="w-full" />
          <p class="mt-1 text-[11px]" :class="settings?.apiKeyConfigured ? 'text-[var(--sz-success-text)]' : 'text-[var(--sz-warning-text)]'">
            {{
              settings?.apiKeyConfigured
                ? t('settings.assistant.keyConfigured')
                : t('settings.assistant.keyMissing')
            }}
          </p>
          <p v-if="settings?.apiKeyEnvResolved" class="mt-1 text-[11px] text-[var(--sz-text-dim)]">
            {{ t('settings.assistant.resolvedEnv', { env: settings.apiKeyEnvResolved }) }}
          </p>
        </UFormField>
        <UFormField :label="t('settings.assistant.temperature')" name="temperature">
          <UInputNumber v-model="form.temperature" :min="0" :max="2" :step="0.1" class="w-full" />
        </UFormField>
        <UFormField :label="t('settings.assistant.maxTokens')" name="maxTokens">
          <UInputNumber v-model="form.maxTokens" :min="256" :max="32000" :step="256" class="w-full" />
        </UFormField>
        <UFormField :label="t('settings.assistant.reasoningEffort')" name="reasoningEffort">
          <USelect v-model="form.reasoningEffort" :items="effortItems" class="w-full" />
        </UFormField>
        <UFormField :label="t('settings.assistant.timeout')" name="timeoutMs">
          <UInputNumber v-model="form.timeoutMs" :min="5000" :max="120000" :step="1000" class="w-full" />
        </UFormField>
        <UFormField :label="t('settings.assistant.retries')" name="retries">
          <UInputNumber v-model="form.retries" :min="0" :max="5" class="w-full" />
        </UFormField>
        <UFormField :label="t('settings.assistant.readTools')" name="readToolAllowList">
          <UInput v-model="form.readToolAllowList" :placeholder="t('settings.assistant.readToolsPlaceholder')" class="w-full" />
        </UFormField>
      </div>

      <div class="space-y-2 border-t border-[var(--sz-border)] pt-3">
        <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('settings.assistant.dataScope') }}</p>
        <USwitch v-model="form.dataScopePrices" :label="t('settings.assistant.scopePrices')" />
        <USwitch v-model="form.dataScopeLogs" :label="t('settings.assistant.scopeLogs')" />
        <p class="text-[11.5px] leading-relaxed text-[var(--sz-text-muted)]">
          {{ t('settings.assistant.writePolicy') }}
        </p>
      </div>

      <UAlert
        v-if="testResult"
        :color="testResult.ok ? 'success' : 'warning'"
        variant="subtle"
        :icon="testResult.ok ? 'i-lucide-check' : 'i-lucide-cloud-off'"
        :title="testResult.ok ? t('settings.assistant.testOk') : t('settings.assistant.testFailed')"
        :description="testResult.message"
      />

      <div class="flex flex-wrap justify-end gap-2">
        <UButton
          type="button"
          color="neutral"
          variant="outline"
          icon="i-lucide-plug"
          :label="t('settings.assistant.test')"
          :loading="testing"
          @click="testConnection"
        />
        <UButton type="submit" :loading="busy" :label="t('common.save')" />
      </div>
    </UForm>

    <div class="space-y-3 border-t border-[var(--sz-border)] pt-4">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 class="sz-caps text-[var(--sz-text-muted)]">{{ t('settings.assistant.promptsTitle') }}</h2>
          <p class="mt-1 text-[12px] text-[var(--sz-text-muted)]">{{ t('settings.assistant.promptsText') }}</p>
        </div>
        <span class="text-[11px] tabular-nums text-[var(--sz-text-dim)]">
          {{ t('settings.assistant.promptCount', { count: prompts?.prompts.length ?? 0 }) }}
        </span>
      </div>

      <article
        v-for="prompt in prompts?.prompts ?? []"
        :key="prompt.promptId"
        class="border border-[var(--sz-border)] bg-[var(--sz-surface)]"
      >
        <header class="flex flex-wrap items-center gap-2 border-b border-[var(--sz-border)] px-2.5 py-1.5">
          <span class="sz-caps text-[var(--sz-text)]">{{ prompt.name }}</span>
          <span class="text-[11px] text-[var(--sz-text-dim)]">
            {{ prompt.kind }} · v{{ prompt.version }}
          </span>
          <USwitch
            class="ml-auto"
            :model-value="prompt.enabled"
            :aria-label="t('settings.assistant.promptToggle', { name: prompt.name })"
            @update:model-value="togglePrompt(prompt)"
          />
        </header>
        <div class="p-2.5">
          <UTextarea
            v-model="promptDrafts[prompt.promptId]"
            :rows="prompt.kind === 'system' ? 5 : 3"
            class="w-full"
            :aria-label="prompt.name"
          />
          <div class="mt-2 flex justify-end">
            <UButton
              size="xs"
              :label="t('settings.assistant.promptSave')"
              :loading="busy"
              @click="savePrompt(prompt)"
            />
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
