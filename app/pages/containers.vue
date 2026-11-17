<script setup lang="ts">
import type { ContainerPayload } from '~/composables/useDossier';
import type { OwnedEditTarget } from '~/types/dossier';
import { groupRows } from '~/utils/groupRows';

const { t } = useI18n();
useHead(() => ({ title: `${t('containers.pageTitle')} — ${t('common.appName')}` }));

interface ContainerRow {
  key: string;
  ownedId: number | null;
  qty: number;
  quality: string | null;
  skin: string | null;
  note: string | null;
  name: string;
  rank: string | null;
  type: string | null;
  weight: number | null;
  slots: number | null;
  eff: number | null;
  fill: number;
  prot: number | null;
  shield: number | null;
  bonus: string | null;
  icon: string | null;
}

const { payload } = useDossier();
const { g1, g2, num } = useFormat();

const filters = useFilters('containers', {
  view: 'grid',
  q: '',
  rank: ALL_RANKS,
  type: 'all',
  group: 'none',
  sort: 'name',
  dir: 'asc',
});
const sorting = usePersistentSorting(filters);

const rows = computed<ContainerRow[]>(() =>
  (payload.value?.containers ?? []).map((container, index) => ({
    key: `owned-${index}-${container.name}`,
    ownedId: container.ownedId ?? null,
    qty: container.qty ?? 1,
    quality: container.quality ?? null,
    skin: container.skin ?? null,
    note: container.note ?? null,
    name: container.name,
    rank: container.rank ?? null,
    type: container.type ?? null,
    weight: container.weight ?? null,
    slots: container.slots ?? null,
    eff: container.eff ?? null,
    fill: container.artifacts.length,
    prot: container.prot ?? null,
    shield: container.shield ?? null,
    bonus: container.bonus ?? null,
    icon: container.icon ?? null,
  })),
);

const rankItems = computed(() => rankOptions(t));
const sortItems = computed(() => [
  { label: t('containers.sortName'), value: 'name' },
  { label: t('containers.sortWeight'), value: 'weight' },
  { label: t('containers.sortSlots'), value: 'slots' },
  { label: t('containers.sortEfficiency'), value: 'eff' },
  { label: t('containers.sortFill'), value: 'fill' },
]);

function typeOptions(list: ContainerRow[]) {
  const types = [...new Set(list.map((row) => row.type).filter((type): type is string => Boolean(type)))];
  types.sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  return [{ label: t('filters.allTypes'), value: 'all' }, ...types.map((type) => ({ label: type, value: type }))];
}

const typeItems = computed(() => typeOptions(rows.value));
const groupItems = computed(() => [
  { label: t('filters.groupNone'), value: 'none' },
  { label: t('filters.groupByType'), value: 'type' },
]);

const SORT_KEYS = new Set(['name', 'weight', 'slots', 'eff', 'fill']);
const sortKey = computed(() => (SORT_KEYS.has(filters.sort) ? filters.sort : 'name') as keyof ContainerRow);

const filteredRows = computed(() => {
  const query = filters.q.trim().toLowerCase();
  return rows.value.filter((row) => {
    if (filters.rank !== ALL_RANKS && row.rank !== filters.rank) return false;
    if (filters.type !== 'all' && row.type !== filters.type) return false;
    if (!query) return true;
    return [row.name, row.type, row.bonus]
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
  const numeric = { class: { th: 'text-right', td: 'text-right tabular-nums' } };
  return [
    {
      accessorKey: 'name',
      header: sortableHeader(t('table.name')),
      enableSorting: true,
      meta: { class: { td: 'font-medium min-w-48' } },
    },
    { accessorKey: 'type', header: t('table.type') },
    { accessorKey: 'rank', header: t('table.rank') },
    { accessorKey: 'slots', header: sortableHeader(t('table.slots')), enableSorting: true, meta: numeric },
    { accessorKey: 'fill', header: sortableHeader(t('table.fill')), enableSorting: true, meta: numeric },
    { accessorKey: 'eff', header: sortableHeader(t('table.efficiency')), enableSorting: true, meta: numeric },
    { accessorKey: 'weight', header: sortableHeader(t('table.weight')), enableSorting: true, meta: numeric },
  ];
});

const emptyText = computed(() => (rows.value.length ? t('filters.noMatch') : t('containers.emptyDescription')));

const selected = ref<ContainerPayload | null>(null);
const dialogOpen = ref(false);
const editTarget = ref<OwnedEditTarget | null>(null);
const fillTarget = ref<ContainerPayload | null>(null);
const artifactTarget = ref<{ name: string; level: number } | null>(null);

const editOpen = computed({
  get: () => editTarget.value !== null,
  set: (value: boolean) => {
    if (!value) editTarget.value = null;
  },
});
const fillOpen = computed({
  get: () => fillTarget.value !== null,
  set: (value: boolean) => {
    if (!value) fillTarget.value = null;
  },
});
const artifactOpen = computed({
  get: () => artifactTarget.value !== null,
  set: (value: boolean) => {
    if (!value) artifactTarget.value = null;
  },
});
const details = computed(() => payload.value?.details ?? {});
const artifactCard = computed(() =>
  artifactTarget.value ? findDetailsCard(details.value, 'art', artifactTarget.value.name) : null,
);

function cardStats(row: ContainerRow): { label: string; value: string }[] {
  return [
    { label: t('table.slots'), value: row.slots == null ? '—' : num(row.slots) },
    { label: t('table.fill'), value: `${row.fill} / ${row.slots ?? '—'}` },
    { label: t('table.weight'), value: row.weight == null ? '—' : g2(row.weight) },
  ];
}

function selectRow(row: ContainerRow): void {
  selected.value = (payload.value?.containers ?? []).find((container) => container.name === row.name) ?? null;
  dialogOpen.value = true;
}

function openArtifact(name: string, level: number): void {
  dialogOpen.value = false;
  artifactTarget.value = { name, level };
}

function startEdit(container: ContainerPayload): void {
  if (container.ownedId == null) return;
  dialogOpen.value = false;
  editTarget.value = {
    ownedId: container.ownedId,
    name: container.name,
    kind: 'container',
    level: 0,
    qty: container.qty ?? 1,
    quality: container.quality ?? null,
    skin: container.skin ?? null,
    note: container.note ?? null,
    role: null,
    slot: null,
  };
}

function startFill(container: ContainerPayload): void {
  if (container.ownedId == null) return;
  dialogOpen.value = false;
  fillTarget.value = container;
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="min-w-0 break-words">{{ t('containers.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ t('containers.summary', { count: rows.length }) }}
        </p>
      </div>
    </div>

    <DossierPane
      class="min-w-0"
      flush
      :label="t('containers.title')"
      :hint="`${filteredRows.length} / ${rows.length}`"
    >
      <template #header>
        <span class="sz-caps truncate text-[var(--sz-text-muted)]">{{ t('containers.title') }}</span>
      </template>

      <div class="border-b border-[var(--sz-border)] p-2">
        <InventoryToolbar
          :filters="filters"
          :search-placeholder="t('filters.searchContainers')"
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
          <div v-if="sortedRows.length" data-testid="container-grid">
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
                  :icon="row.icon"
                  :description="row.bonus ?? undefined"
                  :stats="cardStats(row)"
                  :selected="selected?.name === row.name"
                  :priority="section === sections[0] && index === 0"
                  @select="selectRow(row)"
                />
              </div>
            </section>
          </div>
          <UEmpty v-else icon="i-lucide-backpack" :title="t('common.empty')" :description="emptyText" />
        </template>

        <template v-else>
          <UEmpty v-if="!sections.length" icon="i-lucide-backpack" :title="t('common.empty')" :description="emptyText" />
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
              <template #slots-cell="{ row }">
                {{ row.original.slots == null ? '—' : num(row.original.slots) }}
              </template>
              <template #fill-cell="{ row }">
                {{ row.original.fill }} / {{ row.original.slots ?? '—' }}
              </template>
              <template #eff-cell="{ row }">
                {{ row.original.eff == null ? '—' : `${g1(row.original.eff)}%` }}
              </template>
              <template #weight-cell="{ row }">
                {{ row.original.weight == null ? '—' : g2(row.original.weight) }}
              </template>
              <template #empty>
                <UEmpty icon="i-lucide-backpack" :title="t('common.empty')" :description="emptyText" />
              </template>
            </UTable>
          </template>
        </template>
      </div>
    </DossierPane>

    <UModal
      v-model:open="dialogOpen"
      :title="t('containers.detailTitle')"
      :description="selected?.name"
      scrollable
    >
      <template #body>
        <ContainerDetail :container="selected" @artifact="openArtifact" />
        <div v-if="selected?.ownedId" class="mt-3 flex flex-wrap gap-2 border-t border-[var(--sz-border)] pt-3">
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
            size="xs"
            :label="t('common.edit')"
            @click="startEdit(selected)"
          />
          <UButton
            icon="i-lucide-gem"
            color="neutral"
            variant="outline"
            size="xs"
            :label="t('containers.fill')"
            @click="startFill(selected)"
          />
        </div>
      </template>
      <template #footer>
        <KeyHint :keys="['Esc']" :label="t('common.close')" />
      </template>
    </UModal>

    <UModal
      v-model:open="artifactOpen"
      :title="t('items.artifactCardTitle')"
      :description="artifactTarget?.name"
      scrollable
    >
      <template #body>
        <ItemCard
          v-if="artifactTarget"
          :name="artifactTarget.name"
          kind="artifact"
          :data="{ name: artifactTarget.name, lvl: artifactTarget.level }"
          :card="artifactCard"
          :level="artifactTarget.level"
        />
      </template>
      <template #footer>
        <KeyHint :keys="['Esc']" :label="t('common.close')" />
      </template>
    </UModal>

    <EditOwnedModal v-model:open="editOpen" :target="editTarget" />
    <ContainerFillEditor v-model:open="fillOpen" :container="fillTarget" />
  </section>
</template>
