<script setup lang="ts">
useHead({ title: 'Броня — STALZONE Dossier' });

interface ArmorRow {
  key: string;
  name: string;
  rank: string | null;
  cls: string | null;
  lvl: number | null;
  armor: number | null;
  armor15: number | null;
  weight: number | null;
}

const { payload } = useDossier();
const { g1, g2 } = useFormat();
const filters = useFilters('armor', {
  mode: 'owned',
  q: '',
  rank: ALL_RANKS,
  sort: 'armor',
  dir: 'desc',
});
const sorting = usePersistentSorting(filters);
const selected = ref<ArmorRow | null>(null);
const modalOpen = computed({
  get: () => selected.value !== null,
  set: (value: boolean) => {
    if (!value) selected.value = null;
  },
});

const rankItems = rankOptions();

const ownedRows = computed<ArmorRow[]>(() =>
  (payload.value?.armor ?? []).map((armor, index) => ({
    key: `owned-${index}-${armor.name}`,
    name: armor.name,
    rank: armor.rank ?? null,
    cls: armor.cls ?? null,
    lvl: armor.lvl ?? null,
    armor: armor.armor ?? null,
    armor15: armor.armor15 ?? null,
    weight: armor.weight ?? null,
  })),
);

const catalogRows = computed<ArmorRow[]>(() =>
  (payload.value?.catalog.armor ?? []).map((entry, index) => ({
    key: `catalog-${index}-${entry.name}`,
    name: entry.name,
    rank: entry.rank ?? null,
    cls: entry.cls ?? null,
    lvl: null,
    armor: entry.armor15 ?? null,
    armor15: entry.armor15 ?? null,
    weight: entry.weight ?? null,
  })),
);

const rows = computed(() => (filters.mode === 'catalog' ? catalogRows.value : ownedRows.value));

const filteredRows = computed(() => {
  const query = filters.q.trim().toLowerCase();
  return rows.value.filter((row) => {
    if (filters.rank !== ALL_RANKS && row.rank !== filters.rank) return false;
    if (!query) return true;
    return [row.name, row.cls, row.rank]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
});

const columns = computed(() => {
  const catalog = filters.mode === 'catalog';
  const list: {
    accessorKey: string;
    header: string | ReturnType<typeof sortableHeader>;
    enableSorting?: boolean;
    meta?: { class?: { th?: string; td?: string } };
  }[] = [
    {
      accessorKey: 'name',
      header: sortableHeader('Название'),
      enableSorting: true,
      meta: { class: { td: 'font-medium min-w-48' } },
    },
    { accessorKey: 'rank', header: 'Ранг' },
    { accessorKey: 'cls', header: 'Класс' },
  ];
  if (!catalog) {
    list.push({
      accessorKey: 'lvl',
      header: sortableHeader('Ур.'),
      enableSorting: true,
      meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } },
    });
  }
  list.push(
    {
      accessorKey: 'armor',
      header: sortableHeader(catalog ? 'Пулестойкость +15' : 'Пулестойкость'),
      enableSorting: true,
      meta: { class: { th: 'text-right', td: 'text-right tabular-nums font-medium' } },
    },
  );
  if (!catalog) {
    list.push({
      accessorKey: 'armor15',
      header: sortableHeader('+15'),
      enableSorting: true,
      meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } },
    });
  }
  list.push({
    accessorKey: 'weight',
    header: sortableHeader('Вес'),
    enableSorting: true,
    meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } },
  });
  return list;
});

const details = computed(() => payload.value?.details ?? {});
const selectedCard = computed(() =>
  selected.value ? findDetailsCard(details.value, 'a', selected.value.name) : null,
);

const emptyText = computed(() => {
  if (!rows.value.length) {
    return filters.mode === 'catalog'
      ? 'Каталог брони пуст. Загрузите базу EXBO.'
      : 'В досье пока нет брони. Добавьте её через API или MCP.';
  }
  return 'Под фильтры ничего не подошло.';
});
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Броня</h1>
        <p class="text-sm text-muted">
          {{ filteredRows.length }} из {{ rows.length }} · пулестойкость на текущем уровне заточки и на +15
        </p>
      </div>
      <FreshnessBadge
        :data-updated="payload?.freshness.dataUpdated"
        :prices-age-min="payload?.freshness.pricesAgeMin"
      />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <div class="flex gap-1">
        <UButton
          :variant="filters.mode === 'owned' ? 'solid' : 'outline'"
          color="neutral"
          @click="filters.mode = 'owned'"
        >
          Моё · {{ ownedRows.length }}
        </UButton>
        <UButton
          :variant="filters.mode === 'catalog' ? 'solid' : 'outline'"
          color="neutral"
          @click="filters.mode = 'catalog'"
        >
          Каталог · {{ catalogRows.length }}
        </UButton>
      </div>
      <UInput
        v-model="filters.q"
        icon="i-lucide-search"
        placeholder="Поиск: название или класс"
        class="w-full sm:w-72"
      />
      <USelect v-model="filters.rank" :items="rankItems" class="w-40" aria-label="Ранг" />
      <UButton
        v-if="filters.q || filters.rank !== ALL_RANKS"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        label="Сбросить"
        @click="
          () => {
            filters.q = '';
            filters.rank = ALL_RANKS;
          }
        "
      />
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <UTable
        v-model:sorting="sorting"
        :data="filteredRows"
        :columns="columns"
        :loading="!payload"
        :on-select="(_event, row) => (selected = row.original)"
        sticky="header"
      >
        <template #rank-cell="{ row }">
          <RankBadge :rank="row.original.rank" />
        </template>
        <template #lvl-cell="{ row }">
          <span v-if="row.original.lvl != null">+{{ row.original.lvl }}</span>
          <span v-else class="text-muted">—</span>
        </template>
        <template #armor-cell="{ row }">
          {{ row.original.armor == null ? '—' : g1(row.original.armor) }}
        </template>
        <template #armor15-cell="{ row }">
          {{ row.original.armor15 == null ? '—' : g1(row.original.armor15) }}
        </template>
        <template #weight-cell="{ row }">
          {{ row.original.weight == null ? '—' : g2(row.original.weight) }}
        </template>
        <template #empty>
          <UEmpty icon="i-lucide-shield" title="Пусто" :description="emptyText" />
        </template>
      </UTable>
    </UCard>

    <p class="text-xs text-muted">
      Клик по строке открывает карточку брони из исходного досье: защиты, модификаторы и кривую пулестойкости.
    </p>

    <UModal v-model:open="modalOpen" title="Карточка предмета" :description="selected?.name" scrollable>
      <template #body>
        <ItemCard
          v-if="selected"
          :name="selected.name"
          kind="armor"
          :data="selected"
          :card="selectedCard"
          :level="selected.lvl"
        />
      </template>
    </UModal>
  </section>
</template>
