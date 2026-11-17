<script setup lang="ts">
import type {
  SourceDiagnostic,
  SyncDiagnostics,
  SyncResult,
  SyncScheduleValues,
} from '@dossier/shared/contracts';
import { DossierPane, StatRow } from '~/shared/ui';
import { SOURCE_ORDER, canSyncSource, sourceKey } from '../model/sources';
import AutoSyncPanel from './AutoSyncPanel.vue';
import SourceCard from './SourceCard.vue';

const { t } = useI18n();
const toast = useToast();
const { message: apiMessage } = useApiError();
const { formatAge, formatDate } = useFormat();
const { payload, meta, refresh: refreshDossier } = useDossier();
const { write, busy: saving } = useWrite();

const { data, refresh } = useFetch<SyncDiagnostics>('/api/v1/admin/sync', { key: 'sync-diagnostics' });
const diagnostics = computed(() => data.value ?? null);

/** Relative labels wait for the client clock, so SSR and the first client render agree. */
const now = ref<number | null>(null);
const force = ref(false);
const syncing = ref<string | null>(null);

const sources = computed(() => {
  const list = diagnostics.value?.sources ?? [];
  return SOURCE_ORDER.map((id) => list.find((source) => source.id === id)).filter(
    (source): source is SourceDiagnostic => Boolean(source),
  );
});

const profileReason = computed(() => diagnostics.value?.bundles.find((bundle) => bundle.id === 'profile')?.reason ?? null);

function sourceSyncable(id: string): boolean {
  const snapshot = diagnostics.value;
  if (!snapshot) return false;
  if (id !== 'profile') return canSyncSource(id, snapshot.profileApiConfigured);
  if (!canSyncSource('profile', snapshot.profileApiConfigured)) return false;
  return profileReason.value !== 'profile_character' && profileReason.value !== 'profile_region';
}

function disabledHint(id: string): string | null {
  const snapshot = diagnostics.value;
  if (!snapshot || id !== 'profile') return null;
  if (!snapshot.profileApiConfigured) return t('settings.sources.reason.profile_credentials');
  if (profileReason.value === 'profile_character' || profileReason.value === 'profile_region') {
    return t(`settings.sources.reason.${profileReason.value}`);
  }
  return null;
}

const catalogMeta = computed(() => meta.value?.catalogMeta ?? null);
const metaInfo = computed(() => payload.value?.meta ?? {});
const catalogUpdated = computed(() => catalogMeta.value?.updated ?? null);
const catalogSource = computed(() => catalogMeta.value?.source ?? null);
const profileFetched = computed(() =>
  typeof metaInfo.value.statsFetched === 'string' ? metaInfo.value.statsFetched : null,
);

function sourceTitle(id: string): string {
  return id === 'all' ? t('settings.sources.syncAll') : t(sourceKey(id, 'title'));
}

async function syncSource(id: string): Promise<void> {
  syncing.value = id;
  try {
    const response = await $fetch<{ results: SyncResult[] }>('/api/v1/admin/sync', {
      method: 'POST',
      body: { source: id, force: force.value },
    });
    const failed = response.results.filter((result) => result.status !== 'ok');
    if (!failed.length) {
      const items = response.results.reduce((total, result) => total + result.items, 0);
      toast.add({
        title: t('settings.toast.sourceUpdated'),
        description: t('settings.toast.sourceUpdatedDescription', { source: sourceTitle(id), count: items }),
        color: 'success',
        icon: 'i-lucide-check',
      });
    } else {
      const first = failed[0]!;
      toast.add({
        title: t('settings.toast.sourceUnavailable'),
        description: apiMessage(
          first.error,
          first.error || t('settings.toast.sourceUnavailableDescription'),
        ),
        color: 'warning',
        icon: 'i-lucide-cloud-off',
      });
    }
    await Promise.all([refresh(), refreshDossier()]);
  } catch (error) {
    const data = (error as { data?: { error?: { code?: string; message?: string } } }).data?.error;
    toast.add({
      title: t('settings.toast.syncFailed'),
      description: apiMessage(data?.code, data?.message || t('settings.toast.syncFailedDescription')),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    });
  } finally {
    syncing.value = null;
  }
}

async function saveSchedule(values: SyncScheduleValues): Promise<void> {
  const result = await write('/api/v1/admin/sync', { method: 'PUT', body: { ...values, dryRun: false } });
  if (result) await refresh();
}

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  now.value = Date.now();
  timer = setInterval(() => {
    now.value = Date.now();
    void refresh();
  }, 60_000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  timer = null;
});
</script>

<template>
  <section class="space-y-4">
    <p class="text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">{{ t('settings.sources.intro') }}</p>

    <AutoSyncPanel
      v-if="diagnostics"
      :schedule="diagnostics.schedule"
      :bundles="diagnostics.bundles"
      :profile-api-configured="diagnostics.profileApiConfigured"
      :saving="saving"
      :now="now"
      @save="saveSchedule"
    />

    <DossierPane :title="t('settings.dataSources')">
      <template #actions>
        <UButton
          :label="t('settings.sources.syncAll')"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          size="xs"
          :loading="syncing === 'all'"
          :disabled="syncing !== null && syncing !== 'all'"
          @click="syncSource('all')"
        />
      </template>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <USwitch v-model="force" :label="t('settings.sources.force')" />
        <span class="text-[11px] text-[var(--sz-text-muted)]">{{ t('settings.sources.forceHint') }}</span>
        <span v-if="syncing" class="text-[11px] text-[var(--sz-warning-text)]">
          {{ t('settings.sources.running') }}
        </span>
      </div>
    </DossierPane>

    <div v-if="sources.length" class="grid gap-3 sm:grid-cols-2">
      <SourceCard
        v-for="source in sources"
        :key="source.id"
        :source="source"
        :busy="syncing === source.id || syncing === 'all'"
        :syncable="sourceSyncable(source.id)"
        :disabled-hint="disabledHint(source.id)"
        :now="now"
        @sync="syncSource(source.id)"
      />
    </div>
    <DossierPane v-else :title="t('settings.dataSources')">
      <UEmpty
        icon="i-lucide-cloud-off"
        :title="t('settings.emptyTitle')"
        :description="t('settings.emptyDescription')"
      />
    </DossierPane>

    <DossierPane :title="t('settings.dataTitle')" dense>
      <div class="divide-y divide-[var(--sz-border)]">
        <StatRow :label="t('settings.dossierUpdated')" :value="formatDate(payload?.freshness.dataUpdated)" />
        <StatRow :label="t('settings.prices')" :value="formatAge(payload?.freshness.pricesAgeMin)" />
        <StatRow :label="t('settings.catalogUpdated')" :value="formatDate(catalogUpdated)" />
        <StatRow :label="t('settings.catalogSource')" :value="catalogSource" />
        <StatRow :label="t('settings.profileSnapshot')" :value="formatDate(profileFetched)" />
      </div>
    </DossierPane>
  </section>
</template>
