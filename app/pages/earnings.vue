<script setup lang="ts">
import type { ContentEditTarget } from '~/types/dossier';

useHead({ title: 'Заработок — STALZONE Dossier' });

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

const tierItems = computed(() => [
  { label: 'Все уровни', value: 'all' },
  ...tiers.value.map((tier) => ({ label: tier.title, value: tier.id })),
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

const columns = computed(() => [
  {
    accessorKey: 'activity',
    header: sortableHeader('Занятие'),
    enableSorting: true,
    meta: { class: { td: 'font-medium min-w-52' } },
  },
  {
    accessorKey: 'low',
    header: sortableHeader('Доход'),
    enableSorting: true,
    meta: { class: { td: 'whitespace-nowrap tabular-nums' } },
  },
  { accessorKey: 'tier', header: 'Уровень' },
  { accessorKey: 'where', header: 'Где', meta: { class: { td: 'min-w-48' } } },
  { accessorKey: 'needs', header: 'Нужно', meta: { class: { td: 'min-w-48' } } },
  { accessorKey: 'risk', header: 'Риск' },
  { accessorKey: 'trust', header: 'Надёжность' },
  { accessorKey: 'note', header: 'Заметка', meta: { class: { td: 'min-w-64 text-muted' } } },
  { accessorKey: 'srcDate', header: 'Источник' },
]);
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Заработок</h1>
        <p class="text-sm text-muted">
          {{ rows.length }} способов
          <span v-if="earnings?.updated"> · обновлено {{ formatDate(earnings.updated) }}</span>
        </p>
      </div>
      <FreshnessBadge
        :data-updated="payload?.freshness.dataUpdated"
        :prices-age-min="payload?.freshness.pricesAgeMin"
      />
    </div>

    <UButton
      v-if="earnings"
      icon="i-lucide-pencil"
      color="neutral"
      variant="outline"
      size="sm"
      label="Изменить блок"
      @click="startEdit"
    />

    <UAlert
      v-if="earnings?.note"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="Как читать оценки"
      :description="earnings.note"
    />

    <div v-if="tiers.length" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <UCard v-for="tier in tiers" :key="tier.id">
        <p class="font-medium">{{ tier.title }}</p>
        <p class="mt-1 text-sm text-muted">{{ tier.lead }}</p>
        <p class="mt-2 text-xs text-muted">
          {{ rows.filter((row) => row.tier === tier.id).length }} способов
        </p>
      </UCard>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UInput v-model="filters.q" icon="i-lucide-search" placeholder="Поиск: занятие, место, требование" class="w-full sm:w-80" />
      <USelect v-model="filters.tier" :items="tierItems" class="w-56" aria-label="Уровень" />
      <UButton
        v-if="filters.q || filters.tier !== 'all'"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        label="Сбросить"
        @click="
          () => {
            filters.q = '';
            filters.tier = 'all';
          }
        "
      />
      <span class="text-sm text-muted">{{ filteredRows.length }} из {{ rows.length }}</span>
    </div>

    <UCard v-if="rows.length" :ui="{ body: 'p-0 sm:p-0' }">
      <UTable
        v-model:sorting="sorting"
        :data="filteredRows"
        :columns="columns"
        sticky="header"
      >
        <template #low-cell="{ row }">
          {{ num(row.original.low) }}–{{ num(row.original.high) }} {{ row.original.unit }}
        </template>
        <template #tier-cell="{ row }">
          <UBadge color="neutral" variant="subtle">{{ tierTitle(row.original.tier) }}</UBadge>
        </template>
        <template #srcDate-cell="{ row }">
          <span class="whitespace-nowrap text-xs text-muted">
            {{ row.original.src }}<br>{{ formatDate(row.original.srcDate) }}
          </span>
        </template>
        <template #empty>
          <UEmpty icon="i-lucide-coins" title="Пусто" description="Под фильтры ничего не подошло." />
        </template>
      </UTable>
    </UCard>
    <UEmpty
      v-else
      icon="i-lucide-coins"
      title="Пусто"
      description="В досье пока нет оценок заработка. Добавьте их через API или MCP."
    />

    <UCard v-if="earnings?.forYou?.length">
      <template #header>
        <h2 class="font-medium">Что подходит под твой стиль</h2>
      </template>
      <ul class="list-disc space-y-1 pl-5 text-sm">
        <li v-for="item in earnings.forYou" :key="item">{{ item }}</li>
      </ul>
    </UCard>

    <EditContentBlock v-model:open="editOpen" :target="editTarget" />
  </section>
</template>
