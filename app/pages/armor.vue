<script setup lang="ts">
import type { OwnedEditTarget } from '~/types/dossier';

const { t } = useI18n();
useHead(() => ({ title: `${t('armor.pageTitle')} — ${t('common.appName')}` }));

interface ArmorRow {
  key: string;
  ownedId: number | null;
  qty: number;
  quality: string | null;
  skin: string | null;
  note: string | null;
  name: string;
  rank: string | null;
  cls: string | null;
  lvl: number | null;
  armor: number | null;
  armor15: number | null;
  weight: number | null;
  icon: string | null;
}

const { payload } = useDossier();
const { g1, g2 } = useFormat();
const filters = useFilters('armor', {
  mode: 'owned',
  view: 'grid',
  q: '',
  rank: ALL_RANKS,
  sort: 'armor',
  dir: 'desc',
});
const sorting = usePersistentSorting(filters);
const selected = ref<ArmorRow | null>(null);
const dialogOpen = ref(false);
const editTarget = ref<OwnedEditTarget | null>(null);
const editOpen = computed({
  get: () => editTarget.value !== null,
  set: (value: boolean) => {
    if (!value) editTarget.value = null;
  },
});

const rankItems = computed(() => rankOptions(t));
const sortItems = computed(() => [
  { label: t('table.armor'), value: 'armor' },
  { label: '+15', value: 'armor15' },
  { label: t('table.weight'), value: 'weight' },
  { label: t('table.name'), value: 'name' },
]);

const ownedRows = computed<ArmorRow[]>(() =>
  (payload.value?.armor ?? []).map((armor, index) => ({
    key: `owned-${index}-${armor.name}`,
    ownedId: armor.ownedId ?? null,
    qty: armor.qty ?? 1,
    quality: armor.quality ?? null,
    skin: armor.skin ?? null,
    note: armor.note ?? null,
    name: armor.name,
    rank: armor.rank ?? null,
    cls: armor.cls ?? null,
    lvl: armor.lvl ?? null,
    armor: armor.armor ?? null,
    armor15: armor.armor15 ?? null,
    weight: armor.weight ?? null,
    icon: armor.icon ?? null,
  })),
);

const catalogRows = computed<ArmorRow[]>(() =>
  (payload.value?.catalog.armor ?? []).map((entry, index) => ({
    key: `catalog-${index}-${entry.name}`,
    ownedId: null,
    qty: 1,
    quality: null,
    skin: null,
    note: null,
    name: entry.name,
    rank: entry.rank ?? null,
    cls: entry.cls ?? null,
    lvl: null,
    armor: entry.armor15 ?? null,
    armor15: entry.armor15 ?? null,
    weight: entry.weight ?? null,
    icon: entry.icon ?? null,
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

const sortedRows = computed(() => {
  const direction = filters.dir === 'asc' ? 1 : -1;
  const key = filters.sort as keyof ArmorRow;
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
      header: sortableHeader(t('table.name')),
      enableSorting: true,
      meta: { class: { td: 'font-medium min-w-48' } },
    },
    { accessorKey: 'rank', header: t('table.rank') },
    { accessorKey: 'cls', header: t('table.class') },
  ];
  if (!catalog) {
    list.push({
      accessorKey: 'lvl',
      header: sortableHeader(t('table.level')),
      enableSorting: true,
      meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } },
    });
  }
  list.push({
    accessorKey: 'armor',
    header: sortableHeader(catalog ? t('table.armor15') : t('table.armor')),
    enableSorting: true,
    meta: { class: { th: 'text-right', td: 'text-right tabular-nums font-medium' } },
  });
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
    header: sortableHeader(t('table.weight')),
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
    return filters.mode === 'catalog' ? t('armor.emptyCatalog') : t('armor.emptyOwned');
  }
  return t('filters.noMatch');
});

function cardStats(row: ArmorRow): { label: string; value: string }[] {
  return [
    { label: t('table.armor'), value: row.armor == null ? '—' : g1(row.armor) },
    { label: '+15', value: row.armor15 == null ? '—' : g1(row.armor15) },
    { label: t('table.weight'), value: row.weight == null ? '—' : g2(row.weight) },
  ];
}

function selectRow(row: ArmorRow): void {
  selected.value = row;
  if (import.meta.client && window.matchMedia('(max-width: 1279px)').matches) dialogOpen.value = true;
}

function startEdit(row: ArmorRow): void {
  if (row.ownedId == null) return;
  editTarget.value = {
    ownedId: row.ownedId,
    name: row.name,
    kind: 'armor',
    level: row.lvl ?? 0,
    qty: row.qty,
    quality: row.quality,
    skin: row.skin,
    note: row.note,
    role: null,
    slot: null,
  };
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{{ t('armor.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ t('armor.summary', { shown: filteredRows.length, total: rows.length }) }}
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_296px_minmax(0,1fr)]">
      <div class="order-2 min-w-0 lg:order-1">
        <InventorySidebar active="armor" />
      </div>

      <div class="order-3 hidden min-h-0 xl:order-2 xl:block">
        <DossierPane class="h-full" :title="t('armor.detailTitle')" dense>
        <template v-if="selected" #actions>
          <UButton
            v-if="selected.ownedId"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('weapons.editAria', { name: selected.name })"
            @click="startEdit(selected)"
          />
        </template>

        <ItemCard
          v-if="selected"
          :name="selected.name"
          kind="armor"
          :data="selected"
          :card="selectedCard"
          :level="selected.lvl"
        />
        <div v-else class="space-y-2">
          <p class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('armor.noSelection') }}</p>
          <div class="divide-y divide-[var(--sz-border)] border-t border-[var(--sz-border)]">
            <StatRow :label="t('common.owned')" :value="ownedRows.length" />
            <StatRow :label="t('common.catalog')" :value="catalogRows.length" />
          </div>
        </div>
      </DossierPane>
      </div>

      <DossierPane class="order-1 min-w-0 lg:order-2 xl:order-3" flush :label="t('armor.title')" :hint="`${filteredRows.length} / ${rows.length}`">
        <template #header>
          <span class="sz-caps truncate text-[var(--sz-text-muted)]" :title="t('armor.title')">{{ t('armor.title') }}</span>
        </template>

        <div class="border-b border-[var(--sz-border)] p-2">
          <div class="flex flex-wrap items-center gap-1.5">
            <div class="flex gap-1">
              <UButton
                size="xs"
                color="neutral"
                :variant="filters.mode === 'owned' ? 'solid' : 'outline'"
                @click="filters.mode = 'owned'"
              >
                {{ t('common.owned') }} · {{ ownedRows.length }}
              </UButton>
              <UButton
                size="xs"
                color="neutral"
                :variant="filters.mode === 'catalog' ? 'solid' : 'outline'"
                @click="filters.mode = 'catalog'"
              >
                {{ t('common.catalog') }} · {{ catalogRows.length }}
              </UButton>
            </div>

            <div class="flex gap-1">
              <UButton
                icon="i-lucide-layout-grid"
                size="xs"
                color="neutral"
                :variant="filters.view === 'grid' ? 'solid' : 'ghost'"
                :aria-label="t('weapons.viewGrid')"
                :aria-pressed="filters.view === 'grid'"
                @click="filters.view = 'grid'"
              />
              <UButton
                icon="i-lucide-list"
                size="xs"
                color="neutral"
                :variant="filters.view === 'list' ? 'solid' : 'ghost'"
                :aria-label="t('weapons.viewList')"
                :aria-pressed="filters.view === 'list'"
                @click="filters.view = 'list'"
              />
            </div>

            <UInput
              v-model="filters.q"
              icon="i-lucide-search"
              size="xs"
              :placeholder="t('filters.searchArmor')"
              class="w-full sm:w-56"
            />
            <USelect
              v-model="filters.rank"
              :items="rankItems"
              size="xs"
              class="w-36"
              :aria-label="t('filters.rank')"
            />
            <USelect
              v-model="filters.sort"
              :items="sortItems"
              size="xs"
              class="w-32"
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
              v-if="filters.q || filters.rank !== ALL_RANKS"
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              :label="t('common.reset')"
              @click="
                () => {
                  filters.q = '';
                  filters.rank = ALL_RANKS;
                }
              "
            />
          </div>
        </div>

        <div class="p-2">
          <template v-if="filters.view === 'grid'">
            <div v-if="sortedRows.length" data-testid="armor-grid" class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              <DossierItemCard
                v-for="(row, index) in sortedRows"
                :key="row.key"
                :name="row.name"
                :rank="row.rank"
                :category="row.cls"
                :level="row.lvl"
                :icon="row.icon"
                :stats="cardStats(row)"
                :selected="selected?.key === row.key"
                :priority="index === 0"
                @select="selectRow(row)"
              />
            </div>
            <UEmpty
              v-else
              icon="i-lucide-shield"
              :title="t('common.empty')"
              :description="emptyText"
            />
          </template>

          <UTable
            v-else
            v-model:sorting="sorting"
            :data="filteredRows"
            :columns="columns"
            :loading="!payload"
            :on-select="(_event, row) => selectRow(row.original)"
            sticky="header"
            class="w-full"
          >
            <template #rank-cell="{ row }">
              <RankBadge :rank="row.original.rank" />
            </template>
            <template #lvl-cell="{ row }">
              <span v-if="row.original.lvl != null">+{{ row.original.lvl }}</span>
              <span v-else class="text-[var(--sz-text-dim)]">—</span>
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
              <UEmpty icon="i-lucide-shield" :title="t('common.empty')" :description="emptyText" />
            </template>
          </UTable>
        </div>
      </DossierPane>
    </div>

    <p class="text-[11px] text-[var(--sz-text-dim)]">{{ t('armor.hint') }}</p>

    <UModal v-model:open="dialogOpen" :title="t('items.cardTitle')" :description="selected?.name" scrollable>
      <template #body>
        <ItemCard
          v-if="selected"
          :name="selected.name"
          kind="armor"
          :data="selected"
          :card="selectedCard"
          :level="selected.lvl"
        />
        <div v-if="selected?.ownedId" class="mt-3 border-t border-[var(--sz-border)] pt-3">
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
            size="xs"
            :label="t('common.edit')"
            @click="startEdit(selected)"
          />
        </div>
      </template>
      <template #footer>
        <KeyHint :keys="['Esc']" :label="t('common.close')" />
      </template>
    </UModal>

    <EditOwnedModal v-model:open="editOpen" :target="editTarget" />
  </section>
</template>
