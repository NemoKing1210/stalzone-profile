<script setup lang="ts">
import type { OwnedEditTarget } from '~/types/dossier';
import { groupRows } from '~/utils/groupRows';

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
  icon: string | null;
}

const { payload } = useDossier();
const { g1, g2, num } = useFormat();
const filters = useFilters('weapons', {
  mode: 'owned',
  view: 'grid',
  q: '',
  rank: ALL_RANKS,
  type: 'all',
  group: 'none',
  sort: 'dps',
  dir: 'desc',
});
const sorting = usePersistentSorting(filters);
const addOpen = ref(false);
const selected = ref<WeaponRow | null>(null);
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
  { label: 'DPS', value: 'dps' },
  { label: t('table.damage'), value: 'dmg' },
  { label: t('table.name'), value: 'name' },
  { label: t('table.weight'), value: 'weight' },
  { label: 'TTK', value: 'ttk' },
  { label: t('table.rof'), value: 'rof' },
  { label: t('table.mag'), value: 'mag' },
  { label: t('table.level'), value: 'lvl' },
]);

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
    icon: weapon.icon ?? null,
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
    icon: entry.icon ?? null,
  })),
);

const rows = computed(() => (filters.mode === 'catalog' ? catalogRows.value : ownedRows.value));

function typeOptions(list: WeaponRow[]) {
  const types = [...new Set(list.map((row) => row.type).filter((type): type is string => Boolean(type)))];
  types.sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  return [{ label: t('filters.allTypes'), value: 'all' }, ...types.map((type) => ({ label: type, value: type }))];
}

const typeItems = computed(() => typeOptions([...ownedRows.value, ...catalogRows.value]));
const groupItems = computed(() => [
  { label: t('filters.groupNone'), value: 'none' },
  { label: t('filters.groupByType'), value: 'type' },
]);

const SORT_KEYS = new Set(['dps', 'dmg', 'name', 'weight', 'ttk', 'rof', 'mag', 'lvl']);
const sortKey = computed(() => (SORT_KEYS.has(filters.sort) ? filters.sort : 'dps') as keyof WeaponRow);

const filteredRows = computed(() => {
  const query = filters.q.trim().toLowerCase();
  return rows.value.filter((row) => {
    if (filters.rank !== ALL_RANKS && row.rank !== filters.rank) return false;
    if (filters.type !== 'all' && row.type !== filters.type) return false;
    if (!query) return true;
    return [row.name, row.type, row.caliber, row.rank]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
});

const sortedRows = computed(() => {
  const direction = filters.dir === 'asc' ? 1 : -1;
  const key = sortKey.value;
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

const groupedRows = computed(() =>
  filters.group === 'type' ? groupRows(sortedRows.value, (row) => row.type, t('filters.noType')) : null,
);
const sections = computed(
  () => groupedRows.value ?? [{ key: '__all', label: null as string | null, rows: sortedRows.value }],
);

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

function cardStats(row: WeaponRow): { label: string; value: string }[] {
  return [
    { label: t('table.weight'), value: row.weight == null ? '—' : g2(row.weight) },
    { label: t('table.caliber'), value: row.caliber ?? '—' },
    { label: 'DPS', value: row.dps == null ? '—' : num(row.dps) },
  ];
}

function selectRow(row: WeaponRow): void {
  selected.value = row;
  dialogOpen.value = true;
}

function startEdit(row: WeaponRow): void {
  if (row.ownedId == null) return;
  dialogOpen.value = false;
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
        <h1>{{ t('weapons.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ t('weapons.summary', { shown: filteredRows.length, total: rows.length }) }}
        </p>
      </div>

      <UButton icon="i-lucide-plus" :label="t('owned.add')" @click="addOpen = true" />
    </div>

    <CatalogNotice />

    <DossierPane class="min-w-0" flush :label="t('weapons.title')" :hint="`${filteredRows.length} / ${rows.length}`">
      <template #header>
        <span class="sz-caps truncate text-[var(--sz-text-muted)]" :title="t('weapons.title')">{{
          t('weapons.title')
        }}</span>
      </template>

      <div class="border-b border-[var(--sz-border)] p-2">
        <InventoryToolbar
          :filters="filters"
          :modes="[
            { label: t('common.owned'), value: 'owned', count: ownedRows.length },
            { label: t('common.catalog'), value: 'catalog', count: catalogRows.length },
          ]"
          :search-placeholder="t('filters.searchWeapons')"
          :rank-items="rankItems"
          :type-items="typeItems"
          :type-label="t('filters.type')"
          :sort-items="sortItems"
          :group-items="groupItems"
          @update="(patch) => Object.assign(filters, patch)"
        />
      </div>

      <div class="p-2">
        <template v-if="filters.view === 'grid'">
          <div v-if="sortedRows.length" data-testid="weapon-grid">
            <section v-for="section in sections" :key="section.key" :class="section.label ? 'space-y-2' : ''">
              <h2 v-if="section.label" class="sz-caps text-[11px] text-[var(--sz-text-muted)]">
                {{ section.label }} · {{ section.rows.length }}
              </h2>
              <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                <DossierItemCard
                  v-for="(row, index) in section.rows"
                  :key="row.key"
                  :name="row.name"
                  :rank="row.rank"
                  :category="row.type"
                  :level="row.lvl"
                  :icon="row.icon"
                  :stats="cardStats(row)"
                  :selected="selected?.key === row.key"
                  :priority="section === sections[0] && index === 0"
                  @select="selectRow(row)"
                />
              </div>
            </section>
          </div>
          <UEmpty v-else icon="i-lucide-crosshair" :title="t('common.empty')" :description="emptyText" />
        </template>

        <template v-else>
          <UEmpty
            v-if="!sections.length"
            icon="i-lucide-crosshair"
            :title="t('common.empty')"
            :description="emptyText"
          />
          <template v-for="section in sections" :key="`table-${section.key}`">
            <h2 v-if="section.label" class="sz-caps mb-1 text-[11px] text-[var(--sz-text-muted)]">
              {{ section.label }} · {{ section.rows.length }}
            </h2>
            <UTable
              v-model:sorting="sorting"
              :data="section.rows"
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
              <template #empty>
                <UEmpty icon="i-lucide-crosshair" :title="t('common.empty')" :description="emptyText" />
              </template>
            </UTable>
          </template>
        </template>
      </div>
    </DossierPane>

    <p class="text-[11px] text-[var(--sz-text-dim)]">{{ t('weapons.hint') }}</p>

    <UModal v-model:open="dialogOpen" :title="t('items.cardTitle')" :description="selected?.name" scrollable>
      <template #body>
        <ItemCard
          v-if="selected"
          :name="selected.name"
          kind="weapon"
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
    <AddOwnedModal v-model:open="addOpen" kind="weapon" />
  </section>
</template>
