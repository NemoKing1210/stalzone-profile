<script setup lang="ts" generic="TRow extends { key: string; name: string; rank: string | null }">
import { h, type VNode } from 'vue';

import { ItemCard, findDetailsCard, rankOptions } from '~/entities/item';
import { ProfilePane, KeyHint } from '~/shared/ui';

import type { ContainerFillTarget, InstanceEditTarget } from '~/shared/types/profile';
import {
  filterInventoryRows,
  inventorySections,
  resolveSortKey,
  sortInventoryRows,
  typeOptions,
} from '../model/filters';
import { allInventoryItems } from '../model/instances';
import { sortableHeader } from '../model/tableHeader';
import type { InventoryColumn, InventoryKind } from '../model/types';
import { useFilters } from '../model/useFilters';
import { usePersistentSorting } from '../model/usePersistentSorting';
import CatalogNotice from './CatalogNotice.vue';
import ContainerFillEditor from './ContainerFillEditor.vue';
import EditOwnedModal from './EditOwnedModal.vue';
import InventoryToolbar from './InventoryToolbar.vue';
import { INVENTORY_UI } from './kinds/registry';

const props = defineProps<{ kind: InventoryKind<TRow> }>();

const { t } = useI18n();
const { payload } = useProfile();
const { g1, g2, num } = useFormat();
useHead(() => ({ title: `${t(props.kind.labels.pageTitle)} // ${t('common.appName')}` }));

const ui = computed(() => INVENTORY_UI[props.kind.key]);

const filters = useFilters(props.kind.storageKey, {
  mode: props.kind.defaults.mode,
  view: props.kind.defaults.view,
  q: props.kind.defaults.q,
  rank: props.kind.defaults.rank,
  type: props.kind.defaults.type,
  group: props.kind.defaults.group,
  sort: props.kind.defaults.sort,
  dir: props.kind.defaults.dir,
});
const sorting = usePersistentSorting(filters);

const ownedRows = computed(() => props.kind.toRows(payload.value ?? null, 'owned'));
const catalogRows = computed(() => props.kind.toRows(payload.value ?? null, 'catalog'));
const rows = computed(() => (filters.mode === 'catalog' ? catalogRows.value : ownedRows.value));

const rankItems = computed(() => rankOptions(t));
const modes = computed(() =>
  props.kind.modes
    ? [
        { label: t('common.owned'), value: 'owned', count: ownedRows.value.length },
        { label: t('common.catalog'), value: 'catalog', count: catalogRows.value.length },
      ]
    : undefined,
);
const typeItems = computed(() =>
  typeOptions([...ownedRows.value, ...catalogRows.value], props.kind.groupKey, t('filters.allTypes')),
);
const groupItems = computed(() => [
  { label: t('filters.groupNone'), value: 'none' },
  { label: t(props.kind.labels.groupBy), value: 'type' },
]);

/** A label is an i18n key, or a literal such as DPS that reads the same in every locale. */
function labelOf(label: string): string {
  return label.includes('.') ? t(label) : label;
}

const sortItems = computed(() =>
  props.kind.sortOptions.map((option) => ({ label: labelOf(option.label), value: option.value })),
);
const sortKey = computed(() =>
  resolveSortKey(
    filters.sort,
    props.kind.sortOptions.map((option) => option.value),
    props.kind.defaultSort.key,
  ),
);

const filteredRows = computed(() =>
  filterInventoryRows(rows.value, filters, props.kind.filterKeys, props.kind.groupKey),
);
const sortedRows = computed(() => sortInventoryRows(filteredRows.value, sortKey.value, filters.dir));
const sections = computed(() =>
  inventorySections(sortedRows.value, filters.group, props.kind.groupKey, t('filters.noType')),
);

function tdClass(column: InventoryColumn<TRow>): string | undefined {
  const classes = [
    column.align === 'right' ? 'text-right tabular-nums' : '',
    column.strong ? 'font-medium' : '',
    column.wide ? 'min-w-48' : '',
    column.truncate ? 'max-w-72 truncate' : '',
  ].filter(Boolean);
  return classes.length ? classes.join(' ') : undefined;
}

function renderCell(column: InventoryColumn<TRow>, row: TRow): string | VNode {
  const component = ui.value.cells?.[column.key];
  if (component) return h(component, { row });
  const formatted = column.cell?.(row, { g1, g2, num });
  if (formatted != null) return formatted;
  const raw = (row as unknown as Record<string, unknown>)[column.key];
  return raw == null ? '' : String(raw);
}

const columns = computed(() =>
  props.kind.columns({ mode: filters.mode, catalog: filters.mode === 'catalog' }).map((column) => ({
    accessorKey: column.key as string,
    header: column.sortable ? sortableHeader(labelOf(column.label)) : labelOf(column.label),
    enableSorting: Boolean(column.sortable),
    meta: {
      class: {
        th: column.align === 'right' ? 'text-right' : undefined,
        td: tdClass(column),
      },
    },
    cell: ({ row }: { row: { original: TRow } }) => renderCell(column, row.original),
  })),
);

const emptyText = computed(() =>
  rows.value.length
    ? t('filters.noMatch')
    : t(filters.mode === 'catalog' ? props.kind.labels.emptyCatalog : props.kind.labels.emptyOwned),
);

const addOpen = ref(false);
const selected = ref<TRow | null>(null);
const dialogOpen = ref(false);
const editTarget = ref<InstanceEditTarget | null>(null);
const fillTarget = ref<ContainerFillTarget | null>(null);
const artifactTarget = ref<{ name: string; level: number } | null>(null);

const artifactOpen = computed({
  get: () => artifactTarget.value !== null,
  set: (value: boolean) => {
    if (!value) artifactTarget.value = null;
  },
});
const artifactCard = computed(() =>
  artifactTarget.value ? findDetailsCard(payload.value?.details, 'art', artifactTarget.value.name) : null,
);

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

/** Artifacts that can be dropped into any container; the editor filters the installed ones. */
const artifactCandidates = computed(() =>
  allInventoryItems(payload.value?.inventory).filter((item) => item.kind === 'artifact'),
);

function openRow(row: TRow): void {
  selected.value = row;
  dialogOpen.value = true;
}

function requestEdit(): void {
  const row = selected.value;
  if (!row) return;
  const target = props.kind.editTarget(row);
  if (!target) return;
  dialogOpen.value = false;
  editTarget.value = target;
}

function requestFill(): void {
  const row = selected.value;
  if (!row || !props.kind.fillTarget) return;
  const target = props.kind.fillTarget(row);
  if (!target) return;
  dialogOpen.value = false;
  fillTarget.value = target;
}

/**
 * The artifact card opened from a container must live at the screen level: closing the
 * container modal unmounts its body, and a nested modal would go with it.
 */
function openArtifact(name: string, level: number): void {
  dialogOpen.value = false;
  artifactTarget.value = { name, level };
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="min-w-0 break-words">{{ t(kind.labels.title) }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{
            t(kind.labels.summary, {
              shown: filteredRows.length,
              total: rows.length,
              count: rows.length,
            })
          }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          to="/inventory"
          icon="i-lucide-grid-3x3"
          color="neutral"
          variant="outline"
          :label="t('common.viewGrid')"
        />
        <UButton icon="i-lucide-plus" :label="t('owned.add')" @click="addOpen = true" />
      </div>
    </div>

    <CatalogNotice />

    <ProfilePane
      class="min-w-0"
      flush
      :label="t(kind.labels.title)"
      :hint="`${filteredRows.length} / ${rows.length}`"
    >
      <template #header>
        <span class="sz-caps truncate text-[var(--sz-text-muted)]" :title="t(kind.labels.title)">
          {{ t(kind.labels.title) }}
        </span>
      </template>

      <div class="border-b border-[var(--sz-border)] p-2">
        <InventoryToolbar
          :filters="filters"
          :modes="modes"
          :search-placeholder="t(kind.labels.search)"
          :rank-items="rankItems"
          :type-items="typeItems"
          :type-label="t(kind.labels.typeLabel)"
          :sort-items="sortItems"
          :group-items="groupItems"
          @update="(patch) => Object.assign(filters, patch)"
        />
      </div>

      <div class="p-2">
        <template v-if="filters.view === 'grid'">
          <div v-if="sortedRows.length" :data-testid="kind.gridTestId">
            <section v-for="section in sections" :key="section.key" :class="section.label ? 'space-y-2' : ''">
              <h2 v-if="section.label" class="sz-caps text-[11px] text-[var(--sz-text-muted)]">
                {{ section.label }} · {{ section.rows.length }}
              </h2>
              <div :class="kind.gridClass">
                <component
                  :is="ui.card"
                  v-for="(row, index) in section.rows"
                  :key="row.key"
                  :row="row"
                  :selected="selected?.key === row.key"
                  :priority="section === sections[0] && index === 0"
                  @select="openRow(row)"
                />
              </div>
            </section>
          </div>
          <UEmpty v-else :icon="kind.emptyIcon" :title="t('common.empty')" :description="emptyText" />
        </template>

        <template v-else>
          <UEmpty
            v-if="!sections.length"
            :icon="kind.emptyIcon"
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
              :on-select="(_event, row) => openRow(row.original)"
              sticky="header"
              class="w-full"
            >
              <template #empty>
                <UEmpty :icon="kind.emptyIcon" :title="t('common.empty')" :description="emptyText" />
              </template>
            </UTable>
          </template>
        </template>
      </div>
    </ProfilePane>

    <p v-if="kind.labels.hint" class="text-[11px] text-[var(--sz-text-dim)]">{{ t(kind.labels.hint) }}</p>

    <UModal
      v-model:open="dialogOpen"
      :title="t(kind.labels.modalTitle)"
      :description="selected?.name"
      scrollable
    >
      <template #body>
        <component
          :is="ui.detail"
          v-if="selected"
          :row="selected"
          :detail-kind="ui.detailKind"
          @edit="requestEdit"
          @fill="requestFill"
          @artifact="openArtifact"
          @close="dialogOpen = false"
        />
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
    <ContainerFillEditor v-model:open="fillOpen" :target="fillTarget" :candidates="artifactCandidates" />
    <component :is="ui.actions" v-model:add-open="addOpen" :kind="kind.key" />
  </section>
</template>
