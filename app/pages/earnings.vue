<script setup lang="ts">
import type { ContentEditTarget } from '~/types/dossier';

const { t } = useI18n();
useHead(() => ({ title: `${t('earnings.pageTitle')} — ${t('common.appName')}` }));

interface EarningsRow {
  tier: string;
  activity: string;
  low: number;
  high: number;
  unit: string;
  where: string;
  needs: string;
  risk: string;
  trust: string;
  note: string;
  src: string;
  srcDate: string;
}

interface EarningsTier {
  id: string;
  title: string;
  lead: string;
}

interface Earnings {
  updated?: string;
  note?: string;
  tiers?: EarningsTier[];
  rows?: EarningsRow[];
  forYou?: string[];
}

interface ExpandableRow {
  id: string;
  getIsExpanded(): boolean;
}

const { payload } = useDossier();
const { num, formatDate } = useFormat();
const earnings = computed(() => (payload.value?.earnings ?? null) as Earnings | null);
const rows = computed(() => earnings.value?.rows ?? []);
const tiers = computed(() => earnings.value?.tiers ?? []);
const editTarget = ref<ContentEditTarget | null>(null);
const editOpen = computed({
  get: () => editTarget.value !== null,
  set: (value: boolean) => {
    if (!value) editTarget.value = null;
  },
});

function startEdit(): void {
  editTarget.value = {
    kind: 'earnings',
    slug: null,
    title: null,
    lead: null,
    payload: earnings.value ?? {},
  };
}

const filters = useFilters('earnings', {
  q: '',
  tier: 'all',
  sort: 'low',
  dir: 'desc',
});
const sorting = usePersistentSorting(filters);
const expanded = ref<Record<string, boolean>>({});

const tierItems = computed(() => [
  { label: t('earnings.allTiers'), value: 'all' },
  ...tiers.value.map((tier) => ({ label: tier.title, value: tier.id })),
]);

const sortItems = computed(() => [
  { label: t('earnings.columns.income'), value: 'low' },
  { label: t('earnings.columns.activity'), value: 'activity' },
]);

const filteredRows = computed(() => {
  const query = filters.q.trim().toLowerCase();
  return rows.value.filter((row) => {
    if (filters.tier !== 'all' && row.tier !== filters.tier) return false;
    if (!query) return true;
    return [row.activity, row.where, row.needs, row.note, row.risk, row.trust]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
});

function tierTitle(id: string): string {
  return tiers.value.find((tier) => tier.id === id)?.title ?? id;
}

/** The card list has no table header to sort it, so it follows the same stored sort. */
const sortedRows = computed(() => {
  const direction = filters.dir === 'asc' ? 1 : -1;
  const key = filters.sort as keyof EarningsRow;
  return [...filteredRows.value].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
    return String(left).localeCompare(String(right), 'ru', { numeric: true }) * direction;
  });
});

function isExpanded(id: string): boolean {
  return Boolean(expanded.value[id]);
}

function detailId(id: string): string {
  return `earnings-detail-${id}`;
}

function toggleRow(row: ExpandableRow): void {
  expanded.value = row.getIsExpanded() ? {} : { [row.id]: true };
}

function toggleMobile(index: number): void {
  const id = String(index);
  expanded.value = isExpanded(id) ? {} : { [id]: true };
}

function toggleLabel(row: EarningsRow, open: boolean): string {
  return open
    ? t('earnings.hideDetails', { activity: row.activity })
    : t('earnings.showDetails', { activity: row.activity });
}

const columns = computed(() => [
  {
    accessorKey: 'expand',
    header: ' ',
    enableSorting: false,
    meta: { class: { th: 'w-8', td: 'w-8' } },
  },
  {
    accessorKey: 'activity',
    header: sortableHeader(t('earnings.columns.activity')),
    enableSorting: true,
    meta: { class: { td: 'font-medium min-w-52' } },
  },
  {
    accessorKey: 'low',
    header: sortableHeader(t('earnings.columns.income')),
    enableSorting: true,
    meta: { class: { td: 'whitespace-nowrap tabular-nums' } },
  },
  { accessorKey: 'tier', header: t('earnings.columns.tier') },
  { accessorKey: 'where', header: t('earnings.columns.where'), meta: { class: { td: 'min-w-48' } } },
  { accessorKey: 'needs', header: t('earnings.columns.needs'), meta: { class: { td: 'min-w-48' } } },
  { accessorKey: 'risk', header: t('earnings.columns.risk') },
  { accessorKey: 'trust', header: t('earnings.columns.trust') },
  { accessorKey: 'note', header: t('earnings.columns.note'), meta: { class: { td: 'min-w-64 text-[var(--sz-text-muted)]' } } },
  { accessorKey: 'srcDate', header: t('earnings.columns.source') },
]);
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{{ t('earnings.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ t('earnings.count', { count: rows.length }) }}
          <span v-if="earnings?.updated"> · {{ t('earnings.updated', { date: formatDate(earnings.updated) }) }}</span>
        </p>
      </div>
    </div>

    <UAlert
      v-if="earnings?.note"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :title="t('earnings.noteTitle')"
      :description="earnings.note"
    />

    <div v-if="tiers.length" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="tier in tiers"
        :key="tier.id"
        class="border border-[var(--sz-border)] bg-[var(--sz-surface)] p-2.5"
      >
        <p class="sz-caps text-[11px] text-[var(--sz-text-muted)]">{{ tier.title }}</p>
        <p class="mt-1 text-[12.5px] text-[var(--sz-text-muted)]">{{ tier.lead }}</p>
        <p class="mt-1.5 text-[11px] tabular-nums text-[var(--sz-text-muted)]">
          {{ t('earnings.countMethods', { count: rows.filter((row) => row.tier === tier.id).length }) }}
        </p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="filters.q"
        icon="i-lucide-search"
        size="xs"
        :placeholder="t('earnings.search')"
        class="w-full sm:w-72"
      />
      <USelect
        v-model="filters.tier"
        :items="tierItems"
        size="xs"
        class="w-48"
        :aria-label="t('earnings.tier')"
      />
      <USelect
        v-model="filters.sort"
        :items="sortItems"
        size="xs"
        class="w-40"
        :aria-label="t('filters.sort')"
      />
      <UButton
        :icon="filters.dir === 'desc' ? 'i-lucide-arrow-down-wide-narrow' : 'i-lucide-arrow-up-narrow-wide'"
        size="xs"
        color="neutral"
        variant="ghost"
        :aria-label="t('filters.sort')"
        @click="filters.dir = filters.dir === 'desc' ? 'asc' : 'desc'"
      />
      <UButton
        v-if="filters.q || filters.tier !== 'all'"
        icon="i-lucide-x"
        size="xs"
        color="neutral"
        variant="ghost"
        :label="t('common.reset')"
        @click="
          () => {
            filters.q = '';
            filters.tier = 'all';
          }
        "
      />
      <span class="text-[11px] tabular-nums text-[var(--sz-text-muted)]">
        {{ t('earnings.shownOf', { shown: filteredRows.length, total: rows.length }) }}
      </span>
      <UButton
        v-if="earnings"
        icon="i-lucide-pencil"
        color="neutral"
        variant="outline"
        size="xs"
        class="ml-auto"
        :label="t('earnings.editBlock')"
        @click="startEdit"
      />
    </div>

    <DossierPane v-if="rows.length" :label="t('earnings.title')" flush>
      <div class="hidden overflow-x-auto lg:block">
        <UTable
          v-model:sorting="sorting"
          v-model:expanded="expanded"
          :data="filteredRows"
          :columns="columns"
          sticky="header"
          class="min-w-[1040px]"
          :ui="{ td: 'whitespace-normal align-top' }"
        >
          <template #expand-cell="{ row }">
            <button
              type="button"
              class="flex size-7 items-center justify-center text-[var(--sz-text-dim)] hover:text-[var(--sz-text)]"
              :aria-expanded="row.getIsExpanded()"
              :aria-controls="detailId(String(row.id))"
              :aria-label="toggleLabel(row.original, row.getIsExpanded())"
              @click="toggleRow(row)"
            >
              <UIcon
                :name="row.getIsExpanded() ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                class="size-4"
              />
            </button>
          </template>
          <template #low-cell="{ row }">
            <span class="text-[var(--sz-money)]">{{ num(row.original.low) }}–{{ num(row.original.high) }}</span>
            <span class="text-[var(--sz-text-dim)]"> {{ row.original.unit }}</span>
          </template>
          <template #tier-cell="{ row }">
            <span class="whitespace-nowrap border border-[var(--sz-border)] px-1.5 py-0.5 text-[11px] uppercase tracking-[0.1em]">
              {{ tierTitle(row.original.tier) }}
            </span>
          </template>
          <template #srcDate-cell="{ row }">
            <span class="text-[11px] text-[var(--sz-text-muted)]">
              {{ row.original.src }}<br>{{ formatDate(row.original.srcDate) }}
            </span>
          </template>
          <template #expanded="{ row }">
            <div
              :id="detailId(String(row.id))"
              data-testid="earnings-detail"
              class="space-y-1 px-2 py-2 text-[12.5px]"
            >
              <p>{{ row.original.note }}</p>
              <p class="text-[11px] text-[var(--sz-text-dim)]">
                {{ row.original.src }} · {{ formatDate(row.original.srcDate) }}
              </p>
            </div>
          </template>
          <template #empty>
            <UEmpty icon="i-lucide-coins" :title="t('common.empty')" :description="t('filters.noMatch')" />
          </template>
        </UTable>
      </div>

      <div data-testid="earnings-card-list" class="space-y-2 p-2 lg:hidden">
        <div
          v-for="(row, index) in sortedRows"
          :key="`mobile-${index}`"
          class="border border-[var(--sz-border)]"
        >
          <button
            type="button"
            class="flex w-full flex-col gap-1 p-2 text-left"
            :data-activity="row.activity"
            :aria-expanded="isExpanded(String(index))"
            :aria-controls="`earnings-detail-mobile-${index}`"
            :aria-label="toggleLabel(row, isExpanded(String(index)))"
            @click="toggleMobile(index)"
          >
            <span class="flex flex-wrap items-baseline justify-between gap-2">
              <span class="text-[12.5px] font-medium">{{ row.activity }}</span>
              <span class="text-[12.5px] tabular-nums text-[var(--sz-money)]">
                {{ num(row.low) }}–{{ num(row.high) }} <span class="text-[var(--sz-text-muted)]">{{ row.unit }}</span>
              </span>
            </span>
            <span class="flex flex-wrap gap-x-2 text-[11px] text-[var(--sz-text-muted)]">
              <span>{{ tierTitle(row.tier) }}</span>
              <span>{{ row.where }}</span>
              <span>{{ row.trust }}</span>
            </span>
            <span class="text-[11px] text-[var(--sz-text-muted)]">
              {{ t('earnings.columns.needs') }}: {{ row.needs || '—' }}
            </span>
            <span class="text-[11px] text-[var(--sz-text-muted)]">
              {{ t('earnings.columns.risk') }}: {{ row.risk || '—' }}
            </span>
          </button>
          <div
            v-if="isExpanded(String(index))"
            :id="`earnings-detail-mobile-${index}`"
            data-testid="earnings-detail-card"
            class="space-y-1 border-t border-[var(--sz-border)] p-2 text-[12.5px]"
          >
            <p>{{ row.note }}</p>
            <p class="text-[11px] text-[var(--sz-text-muted)]">
              {{ row.src }} · {{ formatDate(row.srcDate) }}
            </p>
          </div>
        </div>
      </div>
    </DossierPane>
    <UEmpty
      v-else
      icon="i-lucide-coins"
      :title="t('common.empty')"
      :description="t('earnings.emptyDescription')"
    />

    <DossierPane v-if="earnings?.forYou?.length" :title="t('earnings.forYouTitle')" dense>
      <ul class="list-disc space-y-1 pl-5 text-[12.5px]">
        <li v-for="item in earnings.forYou" :key="item">{{ item }}</li>
      </ul>
    </DossierPane>

    <EditContentBlock v-model:open="editOpen" :target="editTarget" />
  </section>
</template>
