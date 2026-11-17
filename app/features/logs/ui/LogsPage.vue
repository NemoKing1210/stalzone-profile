<script setup lang="ts">
import type {
  LogEntry,
  LogGroup,
  LogQueryResult,
  LogStats,
  WriteResult,
} from '@profile/shared/contracts';
import { ProfilePane } from '~/shared/ui';
import {
  EMPTY_LOG_FILTERS,
  filtersToRouteQuery,
  parseLogFilters,
  toLogQuery,
  type LogFilters,
} from '../model/filters';

const { t } = useI18n();
const { formatDate } = useFormat();
const { write, busy } = useWrite();
const route = useRoute();
const router = useRouter();

useHead(() => ({ title: `${t('logs.title')} // ${t('common.appName')}` }));

const filters = ref<LogFilters>(parseLogFilters(route.query as Record<string, unknown>));
const entries = ref<LogEntry[]>([]);
const groups = ref<LogGroup[]>([]);
const hasMore = ref(false);
const nextBefore = ref<number | null>(null);
const loading = ref(false);
const error = ref(false);
const stats = ref<LogStats | null>(null);
const autoRefresh = ref(true);

const selected = ref<LogEntry | null>(null);
const detailOpen = computed({
  get: () => selected.value !== null,
  set: (value: boolean) => {
    if (!value) selected.value = null;
  },
});

const purgeOpen = ref(false);
const purgeScope = ref<'all' | 'filtered'>('all');
const purgePreview = ref<WriteResult | null>(null);

const levelItems = computed(() => [
  { label: t('logs.levels.debug'), value: 'debug' },
  { label: t('logs.levels.info'), value: 'info' },
  { label: t('logs.levels.warn'), value: 'warn' },
  { label: t('logs.levels.error'), value: 'error' },
]);
const categoryItems = computed(() =>
  ['http', 'sync', 'mcp', 'db', 'app', 'client'].map((category) => ({
    label: t(`logs.categories.${category}`),
    value: category,
  })),
);
const sourceItems = computed(() =>
  ['server', 'mcp', 'cli', 'client'].map((source) => ({
    label: t(`logs.sources.${source}`),
    value: source,
  })),
);
const windowItems = computed(() =>
  ['1h', '24h', '7d', 'all'].map((window) => ({ label: t(`logs.windows.${window}`), value: window })),
);
const scopeItems = computed(() => [
  { label: t('logs.purge.all'), value: 'all' },
  { label: t('logs.purge.filtered'), value: 'filtered' },
]);

const columns = computed(() => [
  { accessorKey: 'at', header: t('logs.columns.at') },
  { accessorKey: 'level', header: t('logs.columns.level') },
  { accessorKey: 'category', header: t('logs.columns.category') },
  { accessorKey: 'source', header: t('logs.columns.source') },
  { accessorKey: 'message', header: t('logs.columns.message') },
  { accessorKey: 'durationMs', header: t('logs.columns.duration') },
]);

const activeFilterCount = computed(
  () =>
    filters.value.levels.length +
    filters.value.categories.length +
    filters.value.sources.length +
    (filters.value.window !== '24h' ? 1 : 0) +
    (filters.value.text.trim() ? 1 : 0) +
    (filters.value.requestId.trim() ? 1 : 0) +
    (filters.value.fingerprint.trim() ? 1 : 0),
);

const canFilterPurge = computed(() => activeFilterCount.value > 0);
const purgeBody = computed(() => {
  if (purgeScope.value === 'all') return { scope: 'all' as const, dryRun: false };
  const query = toLogQuery(filters.value);
  const { limit: _limit, before: _before, ...filter } = query;
  return { scope: 'filtered' as const, filter, dryRun: false };
});

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

let requestSeq = 0;
async function load(reset = true): Promise<void> {
  const seq = ++requestSeq;
  if (reset) {
    loading.value = true;
    error.value = false;
  }
  try {
    const page = await $fetch<LogQueryResult>('/api/v1/logs', {
      query: {
        ...toLogQuery(filters.value),
        ...(reset || nextBefore.value == null ? {} : { before: nextBefore.value }),
      },
    });
    // A newer request (another filter change, a refresh) owns the state now.
    if (seq !== requestSeq) return;
    if (reset) {
      entries.value = page.entries;
      groups.value = page.groups;
    } else {
      entries.value.push(...page.entries);
      groups.value = page.groups;
    }
    hasMore.value = page.hasMore;
    nextBefore.value = page.nextBefore;
  } catch {
    if (seq === requestSeq) error.value = true;
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

async function loadStats(): Promise<void> {
  try {
    stats.value = await $fetch<LogStats>('/api/v1/logs/stats');
  } catch {
    stats.value = null;
  }
}

function refreshAll(): void {
  void load(true);
  void loadStats();
}

let debounce = 0;
let interval = 0;

watch(
  filters,
  () => {
    router.replace({ query: filtersToRouteQuery(filters.value) });
    window.clearTimeout(debounce);
    debounce = window.setTimeout(refreshAll, 300);
  },
  { deep: true },
);

// Browser Back/Forward changes the query; bring the controls back in line without a refetch loop.
watch(
  () => route.query,
  (query) => {
    const next = parseLogFilters(query as Record<string, unknown>);
    const same =
      JSON.stringify(filtersToRouteQuery(next)) === JSON.stringify(filtersToRouteQuery(filters.value));
    if (!same) filters.value = next;
  },
);

onMounted(() => {
  refreshAll();
  interval = window.setInterval(() => {
    if (!autoRefresh.value || purgeOpen.value || detailOpen.value) return;
    // A background tab does not need five-second polling.
    if (document.visibilityState === 'hidden') return;
    refreshAll();
  }, 5_000);
});

onBeforeUnmount(() => window.clearInterval(interval));

function resetFilters(): void {
  filters.value = { ...EMPTY_LOG_FILTERS, levels: [], categories: [], sources: [] };
}

function openGroup(group: LogGroup): void {
  filters.value.fingerprint = group.fingerprint;
}

// A preview must always describe the body confirmPurge would send. Switching
// scope (or a filter) re-runs the dry run; a token keeps late responses from
// overwriting a newer preview.
let purgeRequest = 0;

async function previewPurge(): Promise<void> {
  const token = ++purgeRequest;
  try {
    // The preview is a quiet read of the write diff: no toast and no shared busy flag.
    const preview = await $fetch<WriteResult>('/api/v1/logs', {
      method: 'DELETE',
      body: { ...purgeBody.value, dryRun: true },
    });
    if (token === purgeRequest) purgePreview.value = preview;
  } catch {
    if (token === purgeRequest) purgePreview.value = null;
  }
}

async function openPurge(): Promise<void> {
  purgeScope.value = canFilterPurge.value ? 'filtered' : 'all';
  purgeOpen.value = true;
  purgePreview.value = null;
  await previewPurge();
}

watch(purgeBody, () => {
  if (purgeOpen.value) void previewPurge();
});

async function confirmPurge(): Promise<void> {
  const result = await write<WriteResult>('/api/v1/logs', {
    method: 'DELETE',
    body: purgeBody.value,
  });
  if (!result) return;
  purgeOpen.value = false;
  purgePreview.value = null;
  refreshAll();
}
</script>

<template>
  <ProfilePane flush :title="t('logs.title')">
    <template #actions>
      <UButton
        to="/settings?tab=logging"
        icon="i-lucide-settings-2"
        color="neutral"
        variant="ghost"
        size="xs"
        :label="t('logs.settings')"
      />
      <USwitch v-model="autoRefresh" :label="t('logs.autoRefresh')" size="xs" />
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        size="xs"
        :label="t('logs.refresh')"
        :loading="loading"
        @click="refreshAll"
      />
      <UButton
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        size="xs"
        :label="t('logs.purge.action')"
        @click="openPurge"
      />
    </template>

    <div class="space-y-3 p-3">
      <p class="text-[12px] leading-relaxed text-[var(--sz-text-muted)]">{{ t('logs.subtitle') }}</p>

      <div v-if="stats" class="flex flex-wrap gap-x-4 gap-y-1 border border-[var(--sz-border)] p-2 text-[11.5px]">
        <span v-for="(count, level) in stats.byLevel" :key="level" class="tabular-nums">
          <span class="sz-caps text-[var(--sz-text-muted)]">{{ t(`logs.levels.${level}`) }}</span>
          {{ count }}
        </span>
        <span class="tabular-nums text-[var(--sz-text-muted)]">
          {{ t('logs.stats.storage', { size: formatBytes(stats.bytes) }) }}
        </span>
        <span class="text-[var(--sz-text-muted)]">
          {{ t('logs.stats.oldest', { at: stats.oldestAt ? formatDate(stats.oldestAt) : t('common.noData') }) }}
        </span>
        <span class="text-[var(--sz-text-muted)]">
          {{ t('logs.stats.newest', { at: stats.newestAt ? formatDate(stats.newestAt) : t('common.noData') }) }}
        </span>
        <NuxtLink to="/logs" class="ml-auto text-[var(--sz-accent)] hover:underline" @click="resetFilters">
          {{ t('logs.reset') }}
        </NuxtLink>
      </div>

      <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <USelect v-model="filters.levels" :items="levelItems" multiple :placeholder="t('logs.filters.levels')" size="xs" />
        <USelect
          v-model="filters.categories"
          :items="categoryItems"
          multiple
          :placeholder="t('logs.filters.categories')"
          size="xs"
        />
        <USelect v-model="filters.sources" :items="sourceItems" multiple :placeholder="t('logs.filters.sources')" size="xs" />
        <USelect v-model="filters.window" :items="windowItems" size="xs" />
        <UInput v-model="filters.text" :placeholder="t('logs.filters.text')" size="xs" class="sm:col-span-2" />
        <UInput v-model="filters.requestId" :placeholder="t('logs.filters.requestId')" size="xs" />
        <div class="flex items-center gap-2">
          <UInput v-model="filters.fingerprint" :placeholder="t('logs.filters.fingerprint')" size="xs" class="flex-1" />
          <UButton
            v-if="filters.fingerprint"
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('logs.filters.clearFingerprint')"
            @click="filters.fingerprint = ''"
          />
        </div>
      </div>

      <div v-if="groups.length" class="flex flex-wrap gap-1">
        <UButton
          v-for="group in groups.slice(0, 12)"
          :key="group.fingerprint"
          color="neutral"
          variant="outline"
          size="xs"
          @click="openGroup(group)"
        >
          <span :data-level="group.level">{{ group.level }}</span>
          {{ group.category }} ×{{ group.count }}
        </UButton>
      </div>

      <div v-if="error" class="border border-[var(--sz-danger)]/40 p-3 text-[12.5px]">
        {{ t('logs.error') }}
        <UButton variant="link" size="xs" @click="refreshAll">{{ t('logs.retry') }}</UButton>
      </div>

      <div v-else-if="loading && entries.length === 0" class="p-4 text-[12.5px] text-[var(--sz-text-muted)]">
        {{ t('logs.loading') }}
      </div>

      <div v-else-if="entries.length === 0" class="p-4">
        <UEmpty icon="i-lucide-bug" :title="t('logs.emptyTitle')" :description="t('logs.emptyText')" />
      </div>

      <UTable v-else :data="entries" :columns="columns" class="text-[12.5px]">
        <template #at-cell="{ row }">
          <span class="whitespace-nowrap tabular-nums text-[var(--sz-text-muted)]">
            {{ formatDate(row.original.at) }}
          </span>
        </template>
        <template #level-cell="{ row }">
          <span :class="['sz-caps', row.original.level === 'error' ? 'text-[var(--sz-danger)]' : '']">
            {{ t(`logs.levels.${row.original.level}`) }}
          </span>
        </template>
        <template #message-cell="{ row }">
          <UButton
            variant="link"
            color="neutral"
            size="xs"
            class="!justify-start !p-0 text-left"
            @click="selected = row.original"
          >
            <span class="line-clamp-2">{{ row.original.message }}</span>
          </UButton>
        </template>
        <template #durationMs-cell="{ row }">
          <span class="tabular-nums text-[var(--sz-text-muted)]">
            {{ row.original.durationMs == null ? '—' : `${row.original.durationMs} ms` }}
          </span>
        </template>
      </UTable>

      <div v-if="hasMore" class="flex justify-center">
        <UButton color="neutral" variant="outline" size="xs" :loading="loading" @click="load(false)">
          {{ t('logs.loadMore') }}
        </UButton>
      </div>
    </div>
  </ProfilePane>

  <UModal
    v-model:open="detailOpen"
    :title="selected ? `${selected.level} · ${selected.category}` : ''"
    scrollable
  >
    <template #body>
      <div v-if="selected" class="space-y-3 text-[12.5px]">
        <p class="whitespace-pre-wrap font-mono">{{ selected.message }}</p>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
          <dt class="text-[var(--sz-text-muted)]">{{ t('logs.detail.at') }}</dt>
          <dd class="tabular-nums">{{ selected.at }}</dd>
          <dt class="text-[var(--sz-text-muted)]">{{ t('logs.detail.source') }}</dt>
          <dd>{{ selected.source }}</dd>
          <dt class="text-[var(--sz-text-muted)]">{{ t('logs.detail.requestId') }}</dt>
          <dd class="font-mono">{{ selected.requestId ?? '—' }}</dd>
          <dt class="text-[var(--sz-text-muted)]">{{ t('logs.detail.fingerprint') }}</dt>
          <dd class="break-all font-mono">{{ selected.fingerprint }}</dd>
          <dt class="text-[var(--sz-text-muted)]">{{ t('logs.detail.duration') }}</dt>
          <dd class="tabular-nums">{{ selected.durationMs == null ? '—' : `${selected.durationMs} ms` }}</dd>
        </dl>
        <div v-if="selected.context != null">
          <div class="sz-caps mb-1 text-[var(--sz-text-muted)]">{{ t('logs.detail.context') }}</div>
          <pre class="max-h-72 overflow-auto border border-[var(--sz-border)] p-2 font-mono text-[11px]">{{
            JSON.stringify(selected.context, null, 2)
          }}</pre>
        </div>
        <div v-if="selected.stack">
          <div class="sz-caps mb-1 text-[var(--sz-text-muted)]">{{ t('logs.detail.stack') }}</div>
          <pre class="max-h-72 overflow-auto border border-[var(--sz-border)] p-2 font-mono text-[11px]">{{
            selected.stack
          }}</pre>
        </div>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="purgeOpen" :title="t('logs.purge.title')" :description="t('logs.purge.text')">
    <template #body>
      <div class="space-y-3 text-[12.5px]">
        <USelect v-model="purgeScope" :items="scopeItems" :disabled="!canFilterPurge" class="w-full" />
        <p v-if="purgePreview" class="border border-[var(--sz-border)] p-2 font-mono text-[11.5px]">
          {{ purgePreview.diff.human }}
        </p>
        <p class="text-[11.5px] text-[var(--sz-text-muted)]">{{ t('logs.purge.note') }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="purgeOpen = false">{{ t('common.cancel') }}</UButton>
        <UButton color="error" :loading="busy" :disabled="busy || !purgePreview" @click="confirmPurge">
          {{ t('logs.purge.confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
