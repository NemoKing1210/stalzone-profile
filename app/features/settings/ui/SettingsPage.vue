<script setup lang="ts">
import { DossierPane, StatRow } from '~/shared/ui';
import { DEFAULT_ACCENT } from '~/shared/lib/accents';

const { t } = useI18n();
const { message: apiMessage } = useApiError();
useHead(() => ({ title: `${t('settings.pageTitle')} — ${t('common.appName')}` }));

const { payload, meta, refresh } = useDossier();
const { formatAge, formatDate } = useFormat();
const { accent, presets, setAccent, resetAccent } = useAccent();
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

/** The page owns the tab in the URL and its validation; the screen only renders it. */
const activeTab = defineModel<string>('tab', { default: 'appearance' });

const tabItems = computed(() => [
  { label: t('settings.tabs.appearance'), icon: 'i-lucide-palette', value: 'appearance' },
  { label: t('settings.tabs.sources'), icon: 'i-lucide-cloud', value: 'sources' },
  { label: t('settings.tabs.data'), icon: 'i-lucide-database', value: 'data' },
  { label: t('settings.tabs.journal'), icon: 'i-lucide-history', value: 'journal' },
  { label: t('settings.tabs.cleanup'), icon: 'i-lucide-trash-2', value: 'cleanup' },
]);

const sourceColumns = computed(() => [
  { accessorKey: 'id', header: t('settings.columns.source') },
  { accessorKey: 'status', header: t('settings.columns.status') },
  { accessorKey: 'lastOkAt', header: t('settings.columns.lastOkAt') },
  { accessorKey: 'lastTryAt', header: t('settings.columns.lastTryAt') },
  { accessorKey: 'lastError', header: t('settings.columns.error') },
]);

const statusClass: Record<string, string> = {
  ok: 'border-[var(--sz-success)] text-[var(--sz-success-text)]',
  stale: 'border-[var(--sz-warning)] text-[var(--sz-warning-text)]',
  error: 'border-[var(--sz-danger)] text-[var(--sz-danger-text)]',
  idle: 'border-[var(--sz-border)] text-[var(--sz-text-muted)]',
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
        description: apiMessage(result?.error, result?.error || t('settings.toast.sourceUnavailableDescription')),
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
        <h1>{{ t('settings.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('settings.subtitle') }}</p>
      </div>
    </div>

    <UTabs
      v-model="activeTab"
      :items="tabItems"
      variant="link"
      :ui="{
        root: 'gap-0',
        list: 'gap-0 overflow-x-auto border-b border-[var(--sz-border)]',
        trigger: 'sz-caps rounded-none px-3 py-2.5 text-[var(--sz-text-muted)] hover:text-[var(--sz-text)]',
        content: 'p-0 pt-4',
      }"
    >
      <template #content="{ item }">
        <div v-if="item.value === 'appearance'">
          <DossierPane :title="t('settings.appearanceTitle')">
            <p class="text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
              {{ t('settings.appearanceText') }}
            </p>

            <div
              role="radiogroup"
              :aria-label="t('settings.accent')"
              class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5"
            >
              <label
                v-for="preset in presets"
                :key="preset.id"
                class="flex cursor-pointer items-center gap-2 border px-3 py-2 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--sz-accent)]"
                :class="
                  accent === preset.id
                    ? 'border-[var(--sz-accent)] bg-[var(--sz-surface-alt)] ring-2 ring-[var(--sz-accent)] ring-inset'
                    : 'border-[var(--sz-border)] hover:bg-[var(--sz-surface-alt)]'
                "
              >
                <input
                  type="radio"
                  name="accent"
                  class="sr-only"
                  :value="preset.id"
                  :checked="accent === preset.id"
                  @change="setAccent(preset.id)"
                >
                <span
                  class="size-5 shrink-0 border border-[var(--sz-border-strong)]"
                  :style="{ backgroundColor: preset.hex }"
                  aria-hidden="true"
                />
                <span class="flex-1 text-[12.5px] font-medium">{{ t(preset.labelKey) }}</span>
                <span v-if="preset.id === DEFAULT_ACCENT" class="sz-caps text-[10px] text-[var(--sz-text-dim)]">
                  {{ t('settings.accentDefault') }}
                </span>
                <UIcon v-if="accent === preset.id" name="i-lucide-check" class="size-4 text-[var(--sz-accent)]" />
              </label>
            </div>

            <div class="mt-3">
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                :label="t('settings.accentReset')"
                @click="resetAccent"
              />
            </div>
          </DossierPane>
        </div>

        <div v-else-if="item.value === 'sources'" class="space-y-4">
          <DossierPane :title="t('settings.dataSources')" flush>
            <template #actions>
              <div class="grid w-full grid-cols-2 gap-1 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
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
            </template>

            <div v-if="sources.length" class="max-h-[420px] overflow-auto">
              <UTable :data="sources" :columns="sourceColumns">
                <template #id-cell="{ row }">
                  <span class="font-medium">{{ sourceLabel(row.original.id) }}</span>
                  <span class="block font-mono text-[11px] text-[var(--sz-text-dim)]">{{ row.original.id }}</span>
                </template>
                <template #status-cell="{ row }">
                  <span
                    class="inline-flex border px-1.5 py-0.5 text-[11px] uppercase leading-none tracking-[0.12em]"
                    :class="statusClass[row.original.status] ?? statusClass.idle"
                  >
                    {{ statusLabel(row.original.status) }}
                  </span>
                </template>
                <template #lastOkAt-cell="{ row }">
                  {{ formatDate(row.original.lastOkAt) }}
                </template>
                <template #lastTryAt-cell="{ row }">
                  {{ formatDate(row.original.lastTryAt) }}
                </template>
                <template #lastError-cell="{ row }">
                  <span class="text-[11px] text-[var(--sz-danger-text)]">{{ row.original.lastError ?? '—' }}</span>
                </template>
              </UTable>
            </div>
            <div v-else class="p-4">
              <UEmpty
                icon="i-lucide-cloud-off"
                :title="t('settings.emptyTitle')"
                :description="t('settings.emptyDescription')"
              />
            </div>
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
        </div>

        <div v-else-if="item.value === 'data'" class="grid gap-4 lg:grid-cols-2">
          <DossierPane :title="t('settings.exportTitle')" dense>
            <p class="text-[12.5px] text-[var(--sz-text-muted)]">
              {{ t('settings.exportText') }}
            </p>
            <div class="mt-3">
              <UButton
                to="/api/v1/admin/export"
                external
                icon="i-lucide-download"
                color="neutral"
                variant="outline"
                size="sm"
                :label="t('settings.downloadJson')"
              />
            </div>
          </DossierPane>

          <DossierPane :title="t('settings.backupsTitle')" dense>
            <p class="text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
              {{ t('settings.backupsBefore') }}<code class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-1 font-mono text-[11px]">npm run backup</code>{{ t('settings.backupsAfter') }}
            </p>
          </DossierPane>

          <DossierPane :title="t('settings.accessTitle')" dense>
            <p class="text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
              {{ t('settings.accessBefore') }}<code class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-1 font-mono text-[11px]">NUXT_PASSWORD_HASH</code>{{ t('settings.accessBetween') }}<code class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-1 font-mono text-[11px]">NUXT_PASSWORD</code>{{ t('settings.accessAfter') }}
            </p>
          </DossierPane>
        </div>

        <div v-else-if="item.value === 'journal'">
          <slot name="journal" />
        </div>

        <div v-else-if="item.value === 'cleanup'">
          <slot name="cleanup" />
        </div>
      </template>
    </UTabs>
  </section>
</template>
