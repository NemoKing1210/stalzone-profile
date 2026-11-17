<script setup lang="ts">
import { factionSelectItems, factionValue, NO_FACTION, type FactionChoice } from '~/shared/lib/factions';
import {
  catalogProgress,
  catalogSources,
  isSourceReady,
  type CatalogSource,
  type CatalogSourceId,
  type CatalogSourceRun,
} from '../model/catalogSources';
import { shouldCloseSetup } from '../model/shouldCloseSetup';

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

useHead(() => ({ title: `${t('setup.pageTitle')} // ${t('common.appName')}` }));

const { data: setup, refresh: refreshSetup } = await useFetch<SetupResponse>('/api/v1/setup', {
  key: 'setup-state',
});

// A create makes the state say "set up" too; the wizard must stay open for steps 2–3.
let createdHere = false;

watchEffect(() => {
  if (setup.value && shouldCloseSetup({ needsSetup: setup.value.needsSetup, createdHere })) navigateTo('/');
});

const step = ref(1);
const form = reactive<{ nick: string; region: SetupRegion; faction: FactionChoice }>({
  nick: '',
  region: setup.value?.defaultRegion ?? 'ru',
  faction: NO_FACTION,
});
const creating = ref(false);
const results = reactive<Partial<Record<CatalogSourceId, CatalogSourceRun>>>({});
const profileResult = ref<CatalogSourceRun | undefined>();

const sources = computed(() => catalogSources(setup.value?.sources.map((source) => source.id) ?? []));

function storedStatus(id: CatalogSourceId): string {
  return setup.value?.sources.find((source) => source.id === id)?.status ?? 'never';
}

function sourceReady(id: CatalogSourceId): boolean {
  return isSourceReady(storedStatus(id), results[id]);
}

const progress = computed(() => catalogProgress(sources.value, sourceReady));
const running = computed(() => sources.value.some((source) => results[source.id]?.status === 'running'));
const recommendedPending = computed(() =>
  sources.value.filter((source) => source.level !== 'optional' && !sourceReady(source.id)),
);

function sourceStatusText(source: CatalogSource): string {
  const result = results[source.id];
  if (result?.status === 'running') return t('setup.syncing');
  if (result?.status === 'ok') return t('setup.sourceOk', { items: result.items ?? 0 });
  if (result?.status === 'stale') return t('setup.sourceStale', { error: result.error ?? '' });
  const stored = storedStatus(source.id);
  if (stored === 'ok') return t('setup.sourceReady');
  if (stored === 'stale') return t('setup.sourceOutdated');
  return t('setup.sourceNever');
}

function sourceStatusTone(source: CatalogSource): string {
  const result = results[source.id];
  if (result?.status === 'ok' || (!result && storedStatus(source.id) === 'ok')) return 'text-[var(--sz-success)]';
  if (result?.status === 'stale' || (!result && storedStatus(source.id) === 'stale')) {
    return 'text-[var(--sz-danger)]';
  }
  return 'text-[var(--sz-text-dim)]';
}

const regionItems = computed(() =>
  (['ru', 'eu', 'na', 'sea'] as const).map((region) => ({ label: t(`forms.regions.${region}`), value: region })),
);

const factionItems = computed(() => factionSelectItems(t));

async function createCharacter(): Promise<void> {
  if (creating.value || !form.nick.trim()) return;
  creating.value = true;
  try {
    const result = await write('/api/v1/character', {
      method: 'POST',
      body: {
        nick: form.nick.trim(),
        region: form.region,
        faction: factionValue(form.faction),
        dryRun: false,
      },
    });
    if (!result) return;
    createdHere = true;
    await refreshSetup();
    step.value = 2;
  } finally {
    creating.value = false;
  }
}

async function syncSource(source: CatalogSourceId): Promise<void> {
  if (results[source]?.status === 'running') return;
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

/** The recommended sources, one after another, so the bars advance in a predictable order. */
async function downloadRecommended(): Promise<void> {
  if (running.value) return;
  for (const source of recommendedPending.value) await syncSource(source.id);
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
  <div class="sz-atmosphere flex min-h-screen items-start justify-center p-4">
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

      <nav class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        <span class="inline-flex items-center gap-1.5" :class="step === 1 ? 'text-[var(--sz-accent)]' : 'text-[var(--sz-text-dim)]'">
          <span class="tabular-nums">1</span>
          {{ t('setup.stepCharacter') }}
        </span>
        <span class="inline-flex items-center gap-1.5" :class="step === 2 ? 'text-[var(--sz-accent)]' : 'text-[var(--sz-text-dim)]'">
          <span class="tabular-nums">2</span>
          {{ t('setup.stepCatalog') }}
        </span>
        <span class="inline-flex items-center gap-1.5" :class="step === 3 ? 'text-[var(--sz-accent)]' : 'text-[var(--sz-text-dim)]'">
          <span class="tabular-nums">3</span>
          {{ t('setup.stepProfile') }}
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
            <USelect v-model="form.faction" :items="factionItems" class="w-full" />
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

        <div class="border border-[var(--sz-border)] bg-[var(--sz-bg)] p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-[12px] tabular-nums">
              {{ t('setup.readyCount', { done: progress.done, total: progress.total }) }}
            </span>
            <UButton
              v-if="recommendedPending.length"
              size="xs"
              :loading="running"
              :disabled="running"
              icon="i-lucide-download"
              :label="t('setup.downloadAll')"
              @click="downloadRecommended"
            />
          </div>
          <UProgress
            :model-value="running ? null : progress.percent"
            :color="progress.percent === 100 && !running ? 'success' : 'primary'"
            size="sm"
            class="mt-2"
          />
        </div>

        <ul class="space-y-2">
          <li
            v-for="source in sources"
            :key="source.id"
            class="border border-[var(--sz-border)] bg-[var(--sz-surface)]"
          >
            <div class="flex flex-wrap items-start justify-between gap-3 p-3">
              <div class="min-w-0 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-[13px]">{{ t(`sources.${source.id}`) }}</span>
                  <UBadge
                    v-if="source.level === 'required'"
                    size="sm"
                    color="primary"
                    variant="subtle"
                    :label="t('setup.required')"
                  />
                  <UBadge
                    v-else-if="source.level === 'recommended'"
                    size="sm"
                    color="neutral"
                    variant="subtle"
                    :label="t('setup.recommended')"
                  />
                </div>
                <p class="text-[11.5px] leading-snug text-[var(--sz-text-muted)]">
                  {{ t(`setup.sourceInfo.${source.id}`) }}
                </p>
              </div>
              <div class="flex shrink-0 flex-col items-end gap-1.5">
                <UButton
                  size="xs"
                  :color="source.level === 'optional' ? 'neutral' : 'primary'"
                  :variant="source.level === 'optional' ? 'outline' : 'solid'"
                  :loading="results[source.id]?.status === 'running'"
                  :disabled="running && results[source.id]?.status !== 'running'"
                  :label="
                    results[source.id]?.status === 'stale' || storedStatus(source.id) === 'stale'
                      ? t('setup.retry')
                      : t('setup.sync')
                  "
                  @click="syncSource(source.id)"
                />
                <span class="text-[11px] tabular-nums" :class="sourceStatusTone(source)">
                  {{ sourceStatusText(source) }}
                </span>
              </div>
            </div>
            <UProgress
              v-if="results[source.id]"
              :model-value="results[source.id]?.status === 'running' ? null : 100"
              :color="results[source.id]?.status === 'stale' ? 'error' : 'success'"
              size="xs"
            />
          </li>
        </ul>

        <UAlert color="warning" variant="subtle" icon="i-lucide-info" :title="t('setup.catalogEmptyHint')" />

        <div class="flex flex-wrap justify-between gap-2">
          <UButton color="neutral" variant="ghost" :label="t('setup.skipCatalog')" @click="step = 3" />
          <UButton :label="t('setup.continue')" :disabled="running" @click="step = 3" />
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

<style scoped>
/* Display heads keep their own wrapping guarantees, whatever the global sheet holds. */
h1 {
  overflow-wrap: break-word;
  min-width: 0;
  text-wrap: balance;
}
</style>
