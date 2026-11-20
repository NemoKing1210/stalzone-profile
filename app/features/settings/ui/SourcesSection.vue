<script setup lang="ts">
import { useMutation, useQuery } from '@pinia/colada';
import type {
  SourceDiagnostic,
  SyncDiagnostics,
  SyncResult,
  SyncScheduleValues,
} from '@profile/shared/contracts';
import { QUERY_KEYS } from '~/stores/keys';
import { ProfilePane, StatRow } from '~/shared/ui';
import { useProfileData } from '~/stores/profile-data';
import { SOURCE_ORDER, canSyncSource, sortSources, sourceKey, type SourceSort } from '../model/sources';
import AutoSyncPanel from './AutoSyncPanel.vue';
import SourceCard from './SourceCard.vue';

const { t } = useI18n();
const toast = useToast();
const { message: apiMessage } = useApiError();
const { formatAge, formatDate } = useFormat();
const { payload, meta, refresh: refreshProfile } = useProfileData();
const { write, busy: saving } = useWrite();

const request = useRequestFetch();
const { data, refetch: refresh } = useQuery({
  key: QUERY_KEYS.syncDiagnostics,
  query: () => request<SyncDiagnostics>('/api/v1/admin/sync'),
});
const diagnostics = computed(() => data.value ?? null);
const syncRun = useMutation({
  mutation: ({ id, force }: { id: string; force: boolean }) =>
    $fetch<{ results: SyncResult[] }>('/api/v1/admin/sync', {
      method: 'POST',
      body: { source: id, force },
    }),
});

/** Relative labels wait for the client clock, so SSR and the first client render agree. */
const now = ref<number | null>(null);
const force = ref(false);
const syncing = ref<string | null>(null);
const sourceSort = ref<SourceSort>('default');
const SOURCE_SORT_KEY = 'profile:settings-source-sort';
onMounted(() => {
  try {
    const stored = localStorage.getItem(SOURCE_SORT_KEY);
    if (stored === 'freshness' || stored === 'name' || stored === 'default') sourceSort.value = stored;
  } catch {
    /* storage unavailable: keep the canonical order */
  }
});
watch(sourceSort, (value) => {
  try {
    localStorage.setItem(SOURCE_SORT_KEY, value);
  } catch {
    /* the choice still applies for this page */
  }
});

const sortItems = computed(() => [
  { label: t('settings.sources.sortDefault'), value: 'default' },
  { label: t('settings.sources.sortFreshness'), value: 'freshness' },
  { label: t('settings.sources.sortName'), value: 'name' },
]);

const sources = computed(() => {
  const list = diagnostics.value?.sources ?? [];
  const ordered = SOURCE_ORDER.map((id) => list.find((source) => source.id === id)).filter(
    (source): source is SourceDiagnostic => Boolean(source),
  );
  return sortSources(ordered, sourceSort.value, now.value);
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
    const response = await syncRun.mutateAsync({ id, force: force.value });
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
    await Promise.all([refresh(), refreshProfile()]);
  } catch (error) {
    const data =
      error && typeof error === 'object' && 'data' in error
        ? (error as { data?: { error?: { code?: string; message?: string } } }).data
        : undefined;
    toast.add({
      title: t('settings.toast.syncFailed'),
      description: apiMessage(data?.error?.code, data?.error?.message || t('settings.toast.syncFailedDescription')),
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

    <ProfilePane :title="t('settings.dataSources')">
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
        <USelect
          v-model="sourceSort"
          :items="sortItems"
          size="xs"
          class="w-48"
          :aria-label="t('settings.sources.sort')"
        />
        <span v-if="syncing" class="text-[11px] text-[var(--sz-warning-text)]">
          {{ t('settings.sources.running') }}
        </span>
      </div>
    </ProfilePane>

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
    <ProfilePane v-else :title="t('settings.dataSources')">
      <UEmpty
        icon="i-lucide-cloud-off"
        :title="t('settings.emptyTitle')"
        :description="t('settings.emptyDescription')"
      />
    </ProfilePane>

    <ProfilePane :title="t('settings.dataTitle')" dense>
      <div class="divide-y divide-[var(--sz-border)]">
        <StatRow :label="t('settings.profileUpdated')" :value="formatDate(payload?.freshness.dataUpdated)" />
        <StatRow :label="t('settings.prices')" :value="formatAge(payload?.freshness.pricesAgeMin)" />
        <StatRow :label="t('settings.catalogUpdated')" :value="formatDate(catalogUpdated)" />
        <StatRow :label="t('settings.catalogSource')" :value="catalogSource" />
        <StatRow :label="t('settings.profileSnapshot')" :value="formatDate(profileFetched)" />
      </div>
    </ProfilePane>
  </section>
</template>
