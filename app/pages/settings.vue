<script setup lang="ts">
const { t } = useI18n();
const { message: apiMessage } = useApiError();
useHead(() => ({ title: `${t('settings.pageTitle')} — ${t('common.appName')}` }));

const { payload, meta, refresh } = useDossier();
const { formatAge, formatDate } = useFormat();
const toast = useToast();

interface SyncResult {
  source: string;
  status: 'ok' | 'stale';
  items: number;
  error?: string;
}

const syncing = ref<string | null>(null);

const sources = computed(() => payload.value?.freshness.sources ?? []);
const syncableSources = computed(() => sources.value.filter((source) => source.id !== 'local'));
const catalogMeta = computed(() => meta.value?.catalogMeta ?? {});
const metaInfo = computed(() => payload.value?.meta ?? {});
const catalogUpdated = computed(() =>
  typeof catalogMeta.value.updated === 'string' ? catalogMeta.value.updated : null,
);
const catalogSource = computed(() =>
  typeof catalogMeta.value.source === 'string' ? catalogMeta.value.source : null,
);
const profileFetched = computed(() =>
  typeof metaInfo.value.statsFetched === 'string' ? metaInfo.value.statsFetched : null,
);

const sourceColumns = computed(() => [
  { accessorKey: 'id', header: t('settings.columns.source') },
  { accessorKey: 'status', header: t('settings.columns.status') },
  { accessorKey: 'lastOkAt', header: t('settings.columns.lastOkAt') },
  { accessorKey: 'lastTryAt', header: t('settings.columns.lastTryAt') },
  { accessorKey: 'lastError', header: t('settings.columns.error') },
]);

const statusColor: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  ok: 'success',
  stale: 'warning',
  error: 'error',
  idle: 'neutral',
};

function sourceLabel(id: string): string {
  const key = `sources.${id}`;
  const label = t(key);
  return label === key ? id : label;
}

function statusLabel(status: string): string {
  const key = `sources.status.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

async function syncSource(id: string): Promise<void> {
  syncing.value = id;
  try {
    const response = await $fetch<{ results: SyncResult[] }>('/api/v1/admin/sync', {
      method: 'POST',
      body: { source: id },
    });
    const result = response.results[0];
    if (result?.status === 'ok') {
      toast.add({
        title: t('settings.toast.sourceUpdated'),
        description: t('settings.toast.sourceUpdatedDescription', {
          source: sourceLabel(id),
          count: result.items,
        }),
        color: 'success',
        icon: 'i-lucide-check',
      });
    } else {
      toast.add({
        title: t('settings.toast.sourceUnavailable'),
        description: result?.error ?? t('settings.toast.sourceUnavailableDescription'),
        color: 'warning',
        icon: 'i-lucide-cloud-off',
      });
    }
    await refresh();
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
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">{{ t('settings.title') }}</h1>
        <p class="text-sm text-muted">{{ t('settings.subtitle') }}</p>
      </div>
      <FreshnessBadge
        :data-updated="payload?.freshness.dataUpdated"
        :prices-age-min="payload?.freshness.pricesAgeMin"
      />
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-cloud-download" class="size-5 text-primary" />
            <h2 class="font-medium">{{ t('settings.dataSources') }}</h2>
          </div>
          <div class="flex flex-wrap gap-1">
            <UButton
              v-for="source in syncableSources"
              :key="source.id"
              :label="sourceLabel(source.id)"
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="outline"
              size="xs"
              :loading="syncing === source.id"
              :disabled="syncing !== null && syncing !== source.id"
              @click="syncSource(source.id)"
            />
          </div>
        </div>
      </template>

      <UTable v-if="sources.length" :data="sources" :columns="sourceColumns">
        <template #id-cell="{ row }">
          <span class="font-medium">{{ sourceLabel(row.original.id) }}</span>
          <span class="block text-xs text-muted">{{ row.original.id }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="statusColor[row.original.status] ?? 'neutral'" variant="subtle">
            {{ statusLabel(row.original.status) }}
          </UBadge>
        </template>
        <template #lastOkAt-cell="{ row }">
          {{ formatDate(row.original.lastOkAt) }}
        </template>
        <template #lastTryAt-cell="{ row }">
          {{ formatDate(row.original.lastTryAt) }}
        </template>
        <template #lastError-cell="{ row }">
          <span class="text-xs text-error">{{ row.original.lastError ?? '—' }}</span>
        </template>
      </UTable>
      <div v-else class="p-4">
        <UEmpty
          icon="i-lucide-cloud-off"
          :title="t('settings.emptyTitle')"
          :description="t('settings.emptyDescription')"
        />
      </div>
    </UCard>

    <EventLog />

    <div class="grid gap-4 lg:grid-cols-2">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-file-down" class="size-5 text-primary" />
            <h2 class="font-medium">{{ t('settings.exportTitle') }}</h2>
          </div>
        </template>
        <p class="text-sm text-muted">
          {{ t('settings.exportText') }}
        </p>
        <div class="mt-3">
          <UButton
            to="/api/v1/admin/export"
            external
            icon="i-lucide-download"
            color="neutral"
            variant="outline"
            :label="t('settings.downloadJson')"
          />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-database-backup" class="size-5 text-primary" />
            <h2 class="font-medium">{{ t('settings.backupsTitle') }}</h2>
          </div>
        </template>
        <p class="text-sm text-muted">
          {{ t('settings.backupsBefore') }}<code>npm run backup</code>{{ t('settings.backupsAfter') }}
        </p>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-info" class="size-5 text-primary" />
            <h2 class="font-medium">{{ t('settings.dataTitle') }}</h2>
          </div>
        </template>
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-muted">{{ t('settings.dossierUpdated') }}</dt>
            <dd>{{ formatDate(payload?.freshness.dataUpdated) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted">{{ t('settings.prices') }}</dt>
            <dd>{{ formatAge(payload?.freshness.pricesAgeMin) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted">{{ t('settings.catalogUpdated') }}</dt>
            <dd>{{ formatDate(catalogUpdated) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted">{{ t('settings.catalogSource') }}</dt>
            <dd class="text-right">{{ catalogSource ?? '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted">{{ t('settings.profileSnapshot') }}</dt>
            <dd>{{ formatDate(profileFetched) }}</dd>
          </div>
        </dl>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-lock" class="size-5 text-primary" />
            <h2 class="font-medium">{{ t('settings.accessTitle') }}</h2>
          </div>
        </template>
        <p class="text-sm text-muted">
          {{ t('settings.accessBefore') }}<code>NUXT_PASSWORD_HASH</code>{{ t('settings.accessBetween') }}<code>NUXT_PASSWORD</code>{{ t('settings.accessAfter') }}
        </p>
      </UCard>
    </div>
  </section>
</template>
