<script setup lang="ts" generic="TRow extends { key: string; name: string; rank: string | null }">
import { h, type VNode } from 'vue';
import type { LocationQueryRaw } from 'vue-router';

import { rankOptions } from '~/entities/item';
import { barScale } from '../model/comparisonBars';
import { findRowForDeepLink, parseInventoryDeepLink, withoutInventoryDeepLink } from '../model/deepLink';
import ValueWithBar from './kinds/ValueWithBar.vue';
import ItemIconCell from './kinds/ItemIconCell.vue';
import { useProfileData } from '~/stores/profile-data';
import { useItemModalStore } from '~/stores/itemModal';
import { ProfilePane } from '~/shared/ui';
import {
  filterInventoryRows,
  inventorySections,
  resolveSortKey,
  sortInventoryRows,
  typeOptions,
} from '../model/filters';
import { windowSections } from '../model/listWindow';
import { sortableHeader } from '../model/tableHeader';
import type { InventoryColumn, InventoryKind } from '../model/types';
import { useFilters } from '../model/useFilters';
import { usePersistentSorting } from '../model/usePersistentSorting';
import CatalogNotice from './CatalogNotice.vue';
import InventoryToolbar from './InventoryToolbar.vue';
import { INVENTORY_UI } from './kinds/registry';

const props = defineProps<{ kind: InventoryKind<TRow> }>();

const { t } = useI18n();
const { payload } = useProfileData();
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
  ...(props.kind.defaults.hp != null ? { hp: props.kind.defaults.hp } : {}),
});
const sorting = usePersistentSorting(filters);

const ownedRows = computed(() => props.kind.toRows(payload.value ?? null, 'owned'));
const catalogRows = computed(() => props.kind.toRows(payload.value ?? null, 'catalog'));
/** The target HP is a page setting: apply it before filtering so sort and bars agree. */
const rows = computed(() => {
  const base = filters.mode === 'catalog' ? catalogRows.value : ownedRows.value;
  const hp = filters.hp;
  return props.kind.withTarget && hp != null ? props.kind.withTarget(base, hp) : base;
});

const rankItems = computed(() => rankOptions(t));
const modes = computed(() =>
  props.kind.modes
    ? [
        { label: t('common.owned'), value: 'owned', count: ownedRows.value.length },
        { label: t('common.catalog'), value: 'catalog', count: catalogRows.value.length },
      ]
    : undefined,
);
const groupValueLabel = (value: string): string =>
  props.kind.groupLabel ? t(props.kind.groupLabel(value)) : value;
const typeItems = computed(() =>
  typeOptions(
    [...ownedRows.value, ...catalogRows.value],
    props.kind.groupKey,
    t(props.kind.allGroupLabel ?? 'filters.allTypes'),
  ).map((option) => (option.value === 'all' ? option : { ...option, label: groupValueLabel(option.value) })),
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
  inventorySections(
    sortedRows.value,
    filters.group,
    props.kind.groupKey,
    t(props.kind.groupFallback ?? 'filters.noType'),
    groupValueLabel,
  ),
);

/** List mode renders one bounded window of the sorted rows; grid mode is untouched. */
const LIST_WINDOW = 40;
const listLimit = ref(LIST_WINDOW);
const listWindow = computed(() => windowSections(sections.value, listLimit.value));
const shownRows = computed(() => listWindow.value.sections.reduce((sum, section) => sum + section.rows.length, 0));
watch(sections, () => {
  listLimit.value = LIST_WINDOW;
});

function tdClass(column: InventoryColumn<TRow>): string | undefined {
  const classes = [
    column.align === 'right' ? 'text-right tabular-nums' : '',
    column.strong ? 'font-medium' : '',
    column.wide ? 'min-w-48' : '',
    column.truncate ? 'max-w-72 truncate' : '',
    column.icon ? 'w-20' : '',
  ].filter(Boolean);
  return classes.length ? classes.join(' ') : undefined;
}

/** Bars are scaled inside the filtered visible set, never the full catalog. */
const barScales = computed(() => {
  const rows = filteredRows.value as unknown as { key: string; dps?: number | null; dps15?: number | null; ttk?: number | null; ttk15?: number | null; armor?: number | null; armor15?: number | null }[];
  if (props.kind.key === 'weapon') {
    return {
      dps: barScale(rows, (row) => row.dps, 'higher'),
      dps15: barScale(rows, (row) => row.dps15, 'higher'),
      ttk: barScale(rows, (row) => row.ttk, 'lower'),
      ttk15: barScale(rows, (row) => row.ttk15, 'lower'),
    };
  }
  if (props.kind.key === 'armor') {
    return {
      armor: barScale(rows, (row) => row.armor, 'higher'),
      armor15: barScale(rows, (row) => row.armor15, 'higher'),
    };
  }
  return {};
});

function barFor(metric: string, key: string) {
  return barScales.value[metric as keyof typeof barScales.value]?.get(key) ?? null;
}

/** Kinds whose rows carry the instance flag; a catalog/device row is never virtual. */
function rowVirtual(row: TRow): boolean {
  return 'virtual' in row && row.virtual === true;
}

function renderCell(column: InventoryColumn<TRow>, row: TRow): string | VNode {
  if (column.icon) return h(ItemIconCell, { icon: column.icon(row), rank: row.rank, virtual: rowVirtual(row) });
  const component = ui.value.cells?.[column.key];
  if (component) return h(component, { row });
  const fmt = { g1, g2, num, bar: barFor };
  const formatted = column.cell?.(row, fmt);
  const value = formatted ?? (() => {
    const raw = (row as unknown as Record<string, unknown>)[column.key];
    return raw == null ? '' : String(raw);
  })();
  const bar = column.bar?.(row, fmt);
  if (bar) return h(ValueWithBar, { value, bar });
  return value;
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
const route = useRoute();
const router = useRouter();
const deepLink = computed(() => parseInventoryDeepLink(route.query as Record<string, unknown>));
/** Captured once: the watcher clears the query before `useFilters` loads its stored mode. */
const initialDeepLink = parseInventoryDeepLink(route.query as Record<string, unknown>);
onMounted(() => {
  if (route.query.add === '1' && ui.value.actions) addOpen.value = true;
  // Runs after `useFilters` loaded its stored mode, so the deep link's tab is not overwritten.
  const link = deepLink.value ?? initialDeepLink;
  if (link && props.kind.modes) filters.mode = link.itemId != null ? 'owned' : 'catalog';
});
/** The target HP lives with the other filters, so the choice survives a reload. */
function setTargetHp(value: number): void {
  filters.hp = value;
}

const store = useItemModalStore();

/** A table row hands the global modal its target: a live instance, or a catalog name. */
function openRow(row: TRow): void {
  const current = row as unknown as {
    instanceId?: number | null;
    icon?: string | null;
    type?: string | null;
  };
  if (current.instanceId != null) {
    store.openInstance(current.instanceId, props.kind.key);
    return;
  }
  store.openCatalog({
    mode: 'catalog',
    kind: props.kind.key,
    name: row.name,
    icon: current.icon ?? null,
    rank: row.rank,
    category: current.type ?? null,
  });
}

/** A card in the assistant links here; open the target once its payload arrived, then clear the query. */
watch(
  [rows, () => route.query],
  () => {
    const link = deepLink.value;
    if (!link) return;
    // The tab is a page detail; the modal itself resolves the item from the whole profile.
    if (props.kind.modes) filters.mode = link.itemId != null ? 'owned' : 'catalog';
    const row = findRowForDeepLink(rows.value, link);
    if (row) openRow(row);
    else if (link.itemId != null) store.openInstance(link.itemId, props.kind.key);
    else if (link.name) {
      store.openCatalog({
        mode: 'catalog',
        kind: props.kind.key,
        name: link.name,
        icon: null,
        rank: null,
        category: null,
      });
    }
    void router.replace({
      query: withoutInventoryDeepLink(route.query as Record<string, unknown>) as LocationQueryRaw,
    });
  },
  { immediate: true, flush: 'post' },
);
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
          :label="t('nav.inventory')"
        />
        <UButton v-if="ui.actions" icon="i-lucide-plus" :label="t('owned.add')" @click="addOpen = true" />
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

      <div class="space-y-2 border-b border-[var(--sz-border)] p-2">
        <component
          :is="ui.settings"
          v-if="ui.settings"
          :hp="filters.hp ?? 600"
          @update:hp="setTargetHp"
        />
        <InventoryToolbar
          :filters="filters"
          :modes="modes"
          :search-placeholder="t(kind.labels.search)"
          :rank-items="rankItems"
          :type-items="typeItems"
          :type-label="t(kind.labels.typeLabel)"
          :sort-items="sortItems"
          :group-items="groupItems"
          :chart-view="Boolean(ui.chart)"
          @update="(patch) => Object.assign(filters, patch)"
        />
      </div>

      <div class="p-2">
        <component
          :is="ui.chart"
          v-if="filters.view === 'chart' && ui.chart"
          :rows="sortedRows"
          :hp="filters.hp ?? 600"
        />
        <template v-else-if="filters.view === 'grid'">
          <div v-if="sortedRows.length" :data-testid="kind.gridTestId">
            <section v-for="section in sections" :key="section.key" :class="section.label ? 'space-y-2' : ''">
              <h2 v-if="section.label" class="sz-caps text-[11px] text-[var(--sz-text-muted)] [overflow-wrap:break-word]">
                {{ section.label }}
                <span class="tabular-nums">({{ section.rows.length }})</span>
              </h2>
              <div :class="kind.gridClass">
                <component
                  :is="ui.card"
                  v-for="(row, index) in section.rows"
                  :key="row.key"
                  :row="row"
                  :priority="section === sections[0] && index === 0"
                  @open="openRow(row)"
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
          <template v-for="section in listWindow.sections" :key="`table-${section.key}`">
            <h2 v-if="section.label" class="sz-caps mb-1 text-[11px] text-[var(--sz-text-muted)] [overflow-wrap:break-word]">
              {{ section.label }}
              <span class="tabular-nums">({{ section.total }})</span>
            </h2>
            <UTable
              v-model:sorting="sorting"
              :data="section.rows"
              :columns="columns"
              :loading="!payload"
              :on-select="(_event, row) => openRow(row.original)"
              sticky="header"
              :ui="{
                root: 'max-h-[calc(100dvh-26rem)] overflow-auto lg:max-h-[calc(100dvh-22rem)]',
                thead: 'z-10 bg-[var(--sz-surface-header)]',
              }"
              class="w-full"
            >
              <template #empty>
                <UEmpty :icon="kind.emptyIcon" :title="t('common.empty')" :description="emptyText" />
              </template>
            </UTable>
          </template>
          <div
            v-if="listWindow.hidden"
            class="mt-2 flex items-center justify-between gap-2 border-t border-[var(--sz-border)] pt-2"
          >
            <span class="text-[11px] tabular-nums text-[var(--sz-text-dim)]">
              {{ shownRows }} / {{ sortedRows.length }}
            </span>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :label="t('inventory.loadMore')"
              @click="listLimit += LIST_WINDOW"
            />
          </div>
        </template>
      </div>
    </ProfilePane>


    <component :is="ui.actions" v-if="ui.actions" v-model:add-open="addOpen" :kind="kind.key" />
  </section>
</template>

<style scoped>
/* Display heads keep their own wrapping guarantees, whatever the global sheet holds. */
h1,
h2 {
  overflow-wrap: break-word;
  min-width: 0;
  text-wrap: balance;
}
</style>
