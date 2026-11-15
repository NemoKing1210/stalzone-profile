<script setup lang="ts">
import type { OwnedEditTarget } from '~/types/dossier';

const { t } = useI18n();
useHead(() => ({ title: `${t('weapons.pageTitle')} — ${t('common.appName')}` }));

interface WeaponRow {
  key: string;
  ownedId: number | null;
  qty: number;
  quality: string | null;
  skin: string | null;
  note: string | null;
  role: string | null;
  slot: string | null;
  name: string;
  rank: string | null;
  type: string | null;
  lvl: number | null;
  dmg: number | null;
  rof: number | null;
  dps: number | null;
  ttk: number | null;
  mag: number | null;
  caliber: string | null;
  weight: number | null;
}

const { payload } = useDossier();
const { g1, g2, num } = useFormat();
const filters = useFilters('weapons', {
  mode: 'owned',
  q: '',
  rank: ALL_RANKS,
  sort: 'dps',
  dir: 'desc',
});
const sorting = usePersistentSorting(filters);
const selected = ref<WeaponRow | null>(null);
const editTarget = ref<OwnedEditTarget | null>(null);
const editOpen = computed({
  get: () => editTarget.value !== null,
  set: (value: boolean) => {
    if (!value) editTarget.value = null;
  },
});
const modalOpen = computed({
  get: () => selected.value !== null,
  set: (value: boolean) => {
    if (!value) selected.value = null;
  },
});

const rankItems = computed(() => rankOptions(t));

const ownedRows = computed<WeaponRow[]>(() =>
  (payload.value?.weapons ?? []).map((weapon, index) => ({
    key: `owned-${index}-${weapon.name}`,
    ownedId: weapon.ownedId ?? null,
    qty: weapon.qty ?? 1,
    quality: weapon.quality ?? null,
    skin: weapon.skin ?? null,
    note: weapon.note ?? null,
    role: weapon.role ?? null,
    slot: weapon.slot ?? null,
    name: weapon.name,
    rank: weapon.rank ?? null,
    type: weapon.type ?? null,
    lvl: weapon.lvl ?? null,
    dmg: weapon.dmg ?? null,
    rof: weapon.rof ?? null,
    dps: weapon.dps ?? null,
    ttk: weapon.ttk ?? null,
    mag: weapon.mag ?? null,
    caliber: weapon.caliber ?? null,
    weight: weapon.weight ?? null,
  })),
);

const catalogRows = computed<WeaponRow[]>(() =>
  (payload.value?.catalog.weapons ?? []).map((entry, index) => ({
    key: `catalog-${index}-${entry.name}`,
    ownedId: null,
    qty: 1,
    quality: null,
    skin: null,
    note: null,
    role: null,
    slot: null,
    name: entry.name,
    rank: entry.rank ?? null,
    type: entry.type ?? null,
    lvl: null,
    dmg: entry.dmg15 ?? null,
    rof: entry.rof ?? null,
    dps: entry.dps15 ?? null,
    ttk: entry.ttk15 ?? null,
    mag: entry.mag ?? null,
    caliber: entry.caliber ?? null,
    weight: entry.weight ?? null,
  })),
);

const rows = computed(() => (filters.mode === 'catalog' ? catalogRows.value : ownedRows.value));

const filteredRows = computed(() => {
  const query = filters.q.trim().toLowerCase();
  return rows.value.filter((row) => {
    if (filters.rank !== ALL_RANKS && row.rank !== filters.rank) return false;
    if (!query) return true;
    return [row.name, row.type, row.caliber, row.rank]
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
      header: sortableHeader(t('table.name')),
      enableSorting: true,
      meta: { class: { td: 'font-medium min-w-48' } },
    },
    { accessorKey: 'rank', header: t('table.rank') },
    { accessorKey: 'type', header: t('table.type') },
  ];
  if (!catalog) {
    list.push({
      accessorKey: 'lvl',
      header: sortableHeader(t('table.level')),
      enableSorting: true,
      meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } },
    });
  }
  list.push(
    {
      accessorKey: 'dmg',
      header: sortableHeader(catalog ? t('table.damage15') : t('table.damage')),
      enableSorting: true,
      meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } },
    },
    {
      accessorKey: 'rof',
      header: sortableHeader(t('table.rof')),
      enableSorting: true,
      meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } },
    },
    {
      accessorKey: 'dps',
      header: sortableHeader('DPS'),
      enableSorting: true,
      meta: { class: { th: 'text-right', td: 'text-right tabular-nums font-medium' } },
    },
    {
      accessorKey: 'ttk',
      header: sortableHeader('TTK'),
      enableSorting: true,
      meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } },
    },
    {
      accessorKey: 'mag',
      header: sortableHeader(t('table.mag')),
      enableSorting: true,
      meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } },
    },
    { accessorKey: 'caliber', header: t('table.caliber') },
    {
      accessorKey: 'weight',
      header: sortableHeader(t('table.weight')),
      enableSorting: true,
      meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } },
    },
    { accessorKey: 'actions', header: ' ', enableSorting: false, meta: { class: { td: 'text-right' } } },
  );
  return list;
});

const details = computed(() => payload.value?.details ?? {});
const selectedCard = computed(() =>
  selected.value ? findDetailsCard(details.value, 'w', selected.value.name) : null,
);

const emptyText = computed(() => {
  if (!rows.value.length) {
    return filters.mode === 'catalog' ? t('weapons.emptyCatalog') : t('weapons.emptyOwned');
  }
  return t('filters.noMatch');
});

function startEdit(row: WeaponRow): void {
  if (row.ownedId == null) return;
  editTarget.value = {
    ownedId: row.ownedId,
    name: row.name,
    kind: 'weapon',
    level: row.lvl ?? 0,
    qty: row.qty,
    quality: row.quality,
    skin: row.skin,
    note: row.note,
    role: row.role,
    slot: row.slot,
  };
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">{{ t('weapons.title') }}</h1>
        <p class="text-sm text-muted">
          {{ t('weapons.summary', { shown: filteredRows.length, total: rows.length }) }}
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
          {{ t('common.owned') }} · {{ ownedRows.length }}
        </UButton>
        <UButton
          :variant="filters.mode === 'catalog' ? 'solid' : 'outline'"
          color="neutral"
          @click="filters.mode = 'catalog'"
        >
          {{ t('common.catalog') }} · {{ catalogRows.length }}
        </UButton>
      </div>
      <UInput
        v-model="filters.q"
        icon="i-lucide-search"
        :placeholder="t('filters.searchWeapons')"
        class="w-full sm:w-72"
      />
      <USelect v-model="filters.rank" :items="rankItems" class="w-40" :aria-label="t('filters.rank')" />
      <UButton
        v-if="filters.q || filters.rank !== ALL_RANKS"
        icon="i-lucide-x"
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

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <UTable
        v-model:sorting="sorting"
        :data="filteredRows"
        :columns="columns"
        :loading="!payload"
        :on-select="(_event, row) => (selected = row.original)"
        sticky="header"
        class="w-full"
      >
        <template #rank-cell="{ row }">
          <RankBadge :rank="row.original.rank" />
        </template>
        <template #lvl-cell="{ row }">
          <span v-if="row.original.lvl != null">+{{ row.original.lvl }}</span>
          <span v-else class="text-muted">—</span>
        </template>
        <template #dmg-cell="{ row }">
          {{ row.original.dmg == null ? '—' : g1(row.original.dmg) }}
        </template>
        <template #rof-cell="{ row }">
          {{ row.original.rof == null ? '—' : num(row.original.rof) }}
        </template>
        <template #dps-cell="{ row }">
          {{ row.original.dps == null ? '—' : num(row.original.dps) }}
        </template>
        <template #ttk-cell="{ row }">
          {{ row.original.ttk == null ? '—' : g2(row.original.ttk) }}
        </template>
        <template #mag-cell="{ row }">
          {{ row.original.mag == null ? '—' : num(row.original.mag) }}
        </template>
        <template #weight-cell="{ row }">
          {{ row.original.weight == null ? '—' : g2(row.original.weight) }}
        </template>
        <template #actions-cell="{ row }">
          <UButton
            v-if="row.original.ownedId"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('weapons.editAria', { name: row.original.name })"
            @click.stop="startEdit(row.original)"
          />
        </template>
        <template #empty>
          <UEmpty icon="i-lucide-crosshair" :title="t('common.empty')" :description="emptyText" />
        </template>
      </UTable>
    </UCard>

    <p class="text-xs text-muted">
      {{ t('weapons.hint') }}
    </p>

    <UModal v-model:open="modalOpen" :title="t('items.cardTitle')" :description="selected?.name" scrollable>
      <template #body>
        <ItemCard
          v-if="selected"
          :name="selected.name"
          kind="weapon"
          :data="selected"
          :card="selectedCard"
          :level="selected.lvl"
        />
      </template>
    </UModal>

    <EditOwnedModal v-model:open="editOpen" :target="editTarget" />
  </section>
</template>
