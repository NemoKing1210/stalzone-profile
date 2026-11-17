<script setup lang="ts">
definePageMeta({ layout: false });

interface SetupSource {
  id: string;
  status: string;
  lastOkAt: string | null;
  lastTryAt: string | null;
  lastError: string | null;
}

type SetupRegion = 'ru' | 'eu' | 'na' | 'sea';

interface SetupResponse {
  needsSetup: boolean;
  catalogItems: number;
  defaultRegion: SetupRegion;
  profileApiConfigured: boolean;
  sources: SetupSource[];
}

interface SyncResult {
  source: string;
  status: string;
  items: number;
  error?: string;
}

const { t } = useI18n();
const { write } = useWrite();
const { message: apiMessage } = useApiError();

useHead(() => ({ title: `${t('setup.pageTitle')} — ${t('common.appName')}` }));

const { data: setup, refresh: refreshSetup } = await useFetch<SetupResponse>('/api/v1/setup', {
  key: 'setup-state',
});

// A create makes the state say "set up" too; the wizard must stay open for steps 2–3.
let createdHere = false;

watchEffect(() => {
  if (setup.value && shouldCloseSetup({ needsSetup: setup.value.needsSetup, createdHere })) navigateTo('/');
});

const step = ref(1);
const form = reactive<{ nick: string; region: SetupRegion; faction: string; playstyle: string }>({
  nick: '',
  region: setup.value?.defaultRegion ?? 'ru',
  faction: '',
  playstyle: '',
});
const creating = ref(false);
const catalogSources = ['exbo_base', 'wiki', 'motifs', 'scpmodel', 'icons'] as const;
type SourceResult = { status: 'running' | 'ok' | 'stale'; items?: number; error?: string };
const results = reactive<Record<string, SourceResult | undefined>>({});
const profileResult = ref<SourceResult | undefined>();

const availableSources = computed(() =>
  setup.value ? catalogSources.filter((id) => setup.value!.sources.some((source) => source.id === id)) : [],
);

const regionItems = computed(() =>
  (['ru', 'eu', 'na', 'sea'] as const).map((region) => ({ label: t(`forms.regions.${region}`), value: region })),
);

async function createCharacter(): Promise<void> {
  if (creating.value || !form.nick.trim()) return;
  creating.value = true;
  try {
    await write('/api/v1/character', {
      method: 'POST',
      body: {
        nick: form.nick.trim(),
        region: form.region,
        faction: form.faction || null,
        playstyle: form.playstyle || null,
        dryRun: false,
      },
    });
    createdHere = true;
    await refreshSetup();
    step.value = 2;
  } finally {
    creating.value = false;
  }
}

async function syncSource(source: string): Promise<void> {
  results[source] = { status: 'running' };
  try {
    const response = await $fetch<{ results: SyncResult[] }>('/api/v1/admin/sync', {
      method: 'POST',
      body: { source },
    });
    const result = response.results[0];
    if (result?.status === 'ok') results[source] = { status: 'ok', items: result.items };
    else results[source] = { status: 'stale', error: apiMessage(result?.error, result?.error) };
  } catch (error: unknown) {
    const data = (error as { data?: { error?: { code?: string; message?: string } } }).data?.error;
    results[source] = { status: 'stale', error: apiMessage(data?.code, data?.message) };
  }
}

async function syncProfile(): Promise<void> {
  profileResult.value = { status: 'running' };
  try {
    const response = await $fetch<{ results: SyncResult[] }>('/api/v1/admin/sync', {
      method: 'POST',
      body: { source: 'profile' },
    });
    const result = response.results[0];
    if (result?.status === 'ok') profileResult.value = { status: 'ok', items: result.items };
    else profileResult.value = { status: 'stale', error: apiMessage(result?.error, result?.error) };
  } catch (error: unknown) {
    const data = (error as { data?: { error?: { code?: string; message?: string } } }).data?.error;
    profileResult.value = { status: 'stale', error: apiMessage(data?.code, data?.message) };
  }
}
</script>

<template>
  <div class="sz-auth-vignette relative flex min-h-screen items-start justify-center bg-[var(--sz-bg)] p-4">
    <div class="absolute right-4 top-4">
      <LocaleSwitcher />
    </div>

    <div class="mt-10 w-full max-w-[640px] border border-[var(--sz-border)] bg-[var(--sz-surface)] p-6">
      <h1 class="min-w-0 break-words font-brand text-[24px] leading-none tracking-[0.12em] text-[var(--sz-text)]">
        {{ t('common.brandLeft') }} <span class="text-[var(--sz-accent)]">//</span> {{ t('common.brandRight') }}
      </h1>
      <p class="mt-1 text-[12px] text-[var(--sz-text-muted)]">{{ t('setup.pageTitle') }}</p>

      <h2 class="mt-5 text-[18px] text-[var(--sz-text)]">{{ t('setup.title') }}</h2>
      <p class="mt-1 text-[12px] text-[var(--sz-text-muted)]">{{ t('setup.intro') }}</p>

      <nav class="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[11px] uppercase tracking-wider">
        <span :class="step === 1 ? 'text-[var(--sz-accent)]' : 'text-[var(--sz-text-dim)]'">
          1 · {{ t('setup.stepCharacter') }}
        </span>
        <span :class="step === 2 ? 'text-[var(--sz-accent)]' : 'text-[var(--sz-text-dim)]'">
          2 · {{ t('setup.stepCatalog') }}
        </span>
        <span :class="step === 3 ? 'text-[var(--sz-accent)]' : 'text-[var(--sz-text-dim)]'">
          3 · {{ t('setup.stepProfile') }}
        </span>
      </nav>

      <div v-if="step === 1" class="mt-5">
        <UForm :state="form" class="space-y-4" @submit.prevent="createCharacter">
          <UFormField :label="t('setup.nick')" name="nick">
            <UInput v-model="form.nick" autofocus class="w-full" maxlength="64" />
          </UFormField>
          <UFormField :label="t('setup.region')" name="region">
            <USelect v-model="form.region" :items="regionItems" class="w-full" />
          </UFormField>
          <UFormField :label="t('setup.faction')" name="faction">
            <UInput v-model="form.faction" class="w-full" maxlength="100" />
          </UFormField>
          <UFormField :label="t('setup.playstyle')" name="playstyle">
            <UInput v-model="form.playstyle" class="w-full" maxlength="500" />
          </UFormField>
          <UButton
            type="submit"
            block
            :loading="creating"
            :disabled="!form.nick.trim()"
            :label="creating ? t('setup.creating') : t('setup.create')"
          />
        </UForm>
      </div>

      <div v-else-if="step === 2" class="mt-5 space-y-4">
        <p class="text-[12px] text-[var(--sz-text-muted)]">{{ t('setup.catalogIntro') }}</p>
        <UAlert color="warning" variant="subtle" icon="i-lucide-info" :title="t('setup.catalogEmptyHint')" />

        <ul class="divide-y divide-[var(--sz-border)] border border-[var(--sz-border)]">
          <li
            v-for="source in availableSources"
            :key="source"
            class="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
          >
            <span class="text-[13px]">{{ t(`sources.${source}`) }}</span>
            <span class="flex items-center gap-2 text-[11px]">
              <span v-if="results[source]?.status === 'ok'" class="text-[var(--sz-positive)]">
                {{ t('setup.sourceOk', { items: results[source]?.items ?? 0 }) }}
              </span>
              <span v-else-if="results[source]?.status === 'stale'" class="text-[var(--sz-negative)]">
                {{ t('setup.sourceStale', { error: results[source]?.error ?? '' }) }}
              </span>
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                :loading="results[source]?.status === 'running'"
                :label="results[source]?.status === 'stale' ? t('setup.retry') : t('setup.sync')"
                @click="syncSource(source)"
              />
            </span>
          </li>
        </ul>

        <div class="flex flex-wrap justify-between gap-2">
          <UButton color="neutral" variant="ghost" :label="t('setup.skipCatalog')" @click="step = 3" />
          <UButton :label="t('setup.continue')" @click="step = 3" />
        </div>
      </div>

      <div v-else class="mt-5 space-y-4">
        <p class="text-[12px] text-[var(--sz-text-muted)]">{{ t('setup.profileIntro') }}</p>

        <template v-if="setup?.profileApiConfigured">
          <UButton
            :loading="profileResult?.status === 'running'"
            :label="t('setup.profileSync')"
            @click="syncProfile"
          />
          <UAlert
            v-if="profileResult?.status === 'ok'"
            color="success"
            variant="subtle"
            icon="i-lucide-check"
            :title="t('setup.profileSynced', { items: profileResult?.items ?? 0 })"
          />
          <UAlert
            v-else-if="profileResult?.status === 'stale'"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="profileResult?.error"
          />
        </template>
        <template v-else>
          <UAlert
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            :title="t('setup.profileNotConfigured')"
          />
          <UButton color="neutral" variant="outline" to="/settings" :label="t('setup.profileSettings')" />
        </template>

        <div class="flex justify-end">
          <UButton :label="t('setup.finish')" @click="navigateTo('/')" />
        </div>
      </div>
    </div>
  </div>
</template>
