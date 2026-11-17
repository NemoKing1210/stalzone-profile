<script setup lang="ts">
import type { ArtifactPayload } from '~/composables/useDossier';
import type { OwnedEditTarget } from '~/types/dossier';
import { groupRows } from '~/utils/groupRows';

const { t } = useI18n();
useHead(() => ({ title: `${t('artifacts.pageTitle')} — ${t('common.appName')}` }));

const { payload } = useDossier();

const filters = useFilters('artifacts', {
  view: 'grid',
  q: '',
  rank: ALL_RANKS,
  type: 'all',
  group: 'none',
  sort: 'name',
  dir: 'asc',
});
const sorting = usePersistentSorting(filters);
const addOpen = ref(false);

const artifacts = computed(() => payload.value?.artifacts ?? []);
const rankItems = computed(() => rankOptions(t));

function typeOptions(list: ArtifactPayload[]) {
  const types = [...new Set(list.map((artifact) => artifact.type).filter((type): type is string => Boolean(type)))];
  types.sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  return [{ label: t('filters.allTypes'), value: 'all' }, ...types.map((type) => ({ label: type, value: type }))];
}

const typeItems = computed(() => typeOptions(artifacts.value));
const groupItems = computed(() => [
  { label: t('filters.groupNone'), value: 'none' },
  { label: t('filters.groupByType'), value: 'type' },
]);

const sortItems = computed(() => [
  { label: t('artifacts.sortName'), value: 'name' },
  { label: t('artifacts.sortLevel'), value: 'lvl' },
  { label: t('artifacts.sortRank'), value: 'rank' },
]);

const SORT_KEYS = new Set(['name', 'lvl', 'rank']);
const sortKey = computed(() => (SORT_KEYS.has(filters.sort) ? filters.sort : 'name') as keyof ArtifactPayload);

const filteredRows = computed(() => {
  const query = filters.q.trim().toLowerCase();
  return artifacts.value.filter((artifact) => {
    if (filters.rank !== ALL_RANKS && artifact.rank !== filters.rank) return false;
    if (filters.type !== 'all' && artifact.type !== filters.type) return false;
    if (!query) return true;
    return [artifact.name, artifact.type, artifact.effects]
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
  filters.group === 'type' ? groupRows(sortedRows.value, (artifact) => artifact.type, t('filters.noType')) : null,
);
const sections = computed(
  () => groupedRows.value ?? [{ key: '__all', label: null as string | null, rows: sortedRows.value }],
);

const columns = computed(() => {
  const right = { class: { th: 'text-right', td: 'text-right tabular-nums' } };
  return [
    {
      accessorKey: 'name',
      header: sortableHeader(t('table.name')),
      enableSorting: true,
      meta: { class: { td: 'font-medium min-w-48' } },
    },
    { accessorKey: 'type', header: t('table.type') },
    { accessorKey: 'rank', header: sortableHeader(t('table.rank')), enableSorting: true },
    { accessorKey: 'lvl', header: sortableHeader(t('table.level')), enableSorting: true, meta: right },
    { accessorKey: 'q', header: t('table.quality') },
    {
      accessorKey: 'effects',
      header: t('table.effects'),
      enableSorting: false,
      meta: { class: { td: 'max-w-72 truncate' } },
    },
  ];
});

const emptyText = computed(() => (artifacts.value.length ? t('filters.noMatch') : t('artifacts.emptyDescription')));

const selected = ref<ArtifactPayload | null>(null);
const dialogOpen = ref(false);
const editTarget = ref<OwnedEditTarget | null>(null);
const editOpen = computed({
  get: () => editTarget.value !== null,
  set: (value: boolean) => {
    if (!value) editTarget.value = null;
  },
});

const details = computed(() => payload.value?.details ?? {});
const selectedCard = computed(() =>
  selected.value ? findDetailsCard(details.value, 'art', selected.value.name) : null,
);

function cardStats(artifact: ArtifactPayload): { label: string; value: string }[] {
  return [
    { label: '', value: artifact.q ?? '—' },
    { label: '', value: `+${artifact.lvl}` },
  ];
}

function selectArtifact(artifact: ArtifactPayload): void {
  selected.value = artifact;
  dialogOpen.value = true;
}

function startEdit(artifact: ArtifactPayload): void {
  if (artifact.ownedId == null) return;
  dialogOpen.value = false;
  editTarget.value = {
    ownedId: artifact.ownedId,
    name: artifact.name,
    kind: 'artifact',
    level: artifact.lvl,
    qty: artifact.qty ?? 1,
    quality: artifact.quality ?? null,
    skin: artifact.skin ?? null,
    note: artifact.note ?? null,
    role: null,
    slot: null,
  };
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{{ t('artifacts.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ t('artifacts.summary', { shown: filteredRows.length, total: artifacts.length }) }}
        </p>
      </div>

      <UButton icon="i-lucide-plus" :label="t('owned.add')" @click="addOpen = true" />
    </div>

    <CatalogNotice />

    <DossierPane
      class="min-w-0"
      flush
      :label="t('artifacts.title')"
      :hint="`${filteredRows.length} / ${artifacts.length}`"
    >
      <template #header>
        <span class="sz-caps truncate text-[var(--sz-text-muted)]">{{ t('artifacts.title') }}</span>
      </template>

      <div class="border-b border-[var(--sz-border)] p-2">
        <InventoryToolbar
          :filters="filters"
          :search-placeholder="t('filters.searchArtifacts')"
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
          <div v-if="sortedRows.length" data-testid="artifact-grid">
            <section v-for="section in sections" :key="section.key" :class="section.label ? 'space-y-2' : ''">
              <h2 v-if="section.label" class="sz-caps text-[11px] text-[var(--sz-text-muted)]">
                {{ section.label }} · {{ section.rows.length }}
              </h2>
              <div class="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                <DossierItemCard
                  v-for="(artifact, index) in section.rows"
                  :key="`${artifact.name}-${artifact.lvl}`"
                  :name="artifact.name"
                  :rank="artifact.rank"
                  :category="artifact.type"
                  :icon="artifact.icon"
                  :description="artifact.effects ?? undefined"
                  :stats="cardStats(artifact)"
                  :selected="selected?.name === artifact.name && selected?.lvl === artifact.lvl"
                  :priority="section === sections[0] && index === 0"
                  @select="selectArtifact(artifact)"
                />
              </div>
            </section>
          </div>
          <UEmpty v-else icon="i-lucide-gem" :title="t('common.empty')" :description="emptyText" />
        </template>

        <template v-else>
          <UEmpty v-if="!sections.length" icon="i-lucide-gem" :title="t('common.empty')" :description="emptyText" />
          <template v-for="section in sections" :key="`table-${section.key}`">
            <h2 v-if="section.label" class="sz-caps mb-1 text-[11px] text-[var(--sz-text-muted)]">
              {{ section.label }} · {{ section.rows.length }}
            </h2>
            <UTable
              v-model:sorting="sorting"
              :data="section.rows"
              :columns="columns"
              :loading="!payload"
              :on-select="(_event, row) => selectArtifact(row.original)"
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
              <template #q-cell="{ row }">
                {{ row.original.q ?? '—' }}
              </template>
              <template #effects-cell="{ row }">
                {{ row.original.effects ?? '—' }}
              </template>
              <template #empty>
                <UEmpty icon="i-lucide-gem" :title="t('common.empty')" :description="emptyText" />
              </template>
            </UTable>
          </template>
        </template>
      </div>
    </DossierPane>

    <p class="text-[11px] text-[var(--sz-text-dim)]">{{ t('artifacts.hint') }}</p>

    <UModal
      v-model:open="dialogOpen"
      :title="t('items.artifactCardTitle')"
      :description="selected?.name"
      scrollable
    >
      <template #body>
        <ItemCard
          v-if="selected"
          :name="selected.name"
          kind="artifact"
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
    <AddOwnedModal v-model:open="addOpen" kind="artifact" />
  </section>
</template>
