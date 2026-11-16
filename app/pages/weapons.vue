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
  icon: string | null;
}

const { payload } = useDossier();
const { g1, g2, num } = useFormat();
const filters = useFilters('weapons', {
  mode: 'owned',
  view: 'grid',
  q: '',
  rank: ALL_RANKS,
  sort: 'dps',
  dir: 'desc',
});
const sorting = usePersistentSorting(filters);
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

const sortedRows = computed(() => {
  const direction = filters.dir === 'asc' ? 1 : -1;
  const key = filters.sort as keyof WeaponRow;
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
  if (import.meta.client && window.matchMedia('(max-width: 1279px)').matches) dialogOpen.value = true;
}

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
        <h1>{{ t('weapons.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ t('weapons.summary', { shown: filteredRows.length, total: rows.length }) }}
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_296px_minmax(0,1fr)]">
      <div class="order-2 min-w-0 lg:order-1">
        <InventorySidebar active="weapons" />
      </div>

      <div class="order-3 hidden min-h-0 xl:order-2 xl:block">
        <DossierPane class="h-full" :title="t('weapons.detailTitle')" dense>
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
          kind="weapon"
          :data="selected"
          :card="selectedCard"
          :level="selected.lvl"
        />
        <div v-else class="space-y-2">
          <p class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('weapons.noSelection') }}</p>
          <div class="divide-y divide-[var(--sz-border)] border-t border-[var(--sz-border)]">
            <StatRow :label="t('common.owned')" :value="ownedRows.length" />
            <StatRow :label="t('common.catalog')" :value="catalogRows.length" />
          </div>
        </div>
      </DossierPane>
      </div>

      <DossierPane class="order-1 min-w-0 lg:order-2 xl:order-3" flush :label="t('weapons.title')" :hint="`${filteredRows.length} / ${rows.length}`">
        <template #header>
          <span class="sz-caps truncate text-[var(--sz-text-muted)]" :title="t('weapons.title')">{{ t('weapons.title') }}</span>
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
              :placeholder="t('filters.searchWeapons')"
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
            <div v-if="sortedRows.length" data-testid="weapon-grid" class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              <DossierItemCard
                v-for="(row, index) in sortedRows"
                :key="row.key"
                :name="row.name"
                :rank="row.rank"
                :category="row.type"
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
              icon="i-lucide-crosshair"
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
        </div>
      </DossierPane>
    </div>

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
  </section>
</template>
