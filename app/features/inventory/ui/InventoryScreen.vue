<script setup lang="ts" generic="TRow extends { key: string; name: string; rank: string | null }">
import { h, type VNode } from 'vue';
import type { LocationQueryRaw } from 'vue-router';

import { ItemCard, rankOptions } from '~/entities/item';
import { barScale } from '../model/comparisonBars';
import { findRowForDeepLink, parseInventoryDeepLink, withoutInventoryDeepLink } from '../model/deepLink';
import ValueWithBar from './kinds/ValueWithBar.vue';
import ItemIconCell from './kinds/ItemIconCell.vue';
import ItemDetailsModal from './ItemDetailsModal.vue';
import { useInventory } from '../model/useInventory';
import { useProfileData } from '~/stores/profile-data';
import { ProfilePane, KeyHint } from '~/shared/ui';
import { MODAL_WIDTH } from '~/shared/lib/modalWidth';

import type { InventoryItemRead, ModificationSlot } from '@profile/shared/contracts';
import type { ContainerFillTarget, InstanceEditTarget } from '~/shared/types/profile';
import {
  filterInventoryRows,
  inventorySections,
  resolveSortKey,
  sortInventoryRows,
  typeOptions,
} from '../model/filters';
import { allInventoryItems } from '../model/instances';
import { windowSections } from '../model/listWindow';
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
const { payload } = useProfileData();
const { g1, g2, num } = useFormat();
const inventory = useInventory();
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

const selectedKey = ref<string | null>(null);
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
  artifactTarget.value ? (fetchedCards.value.get(`art:${artifactTarget.value.name}`) ?? null) : null,
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
const modificationCandidates = computed(() =>
  allInventoryItems(payload.value?.inventory).filter((item) => item.kind === 'modification'),
);

/** The selected row is recomputed from the payload, so a modal write refreshes it in place. */
const selected = computed<TRow | null>(() => rows.value.find((row) => row.key === selectedKey.value) ?? null);

const CARD_PREFIX: Record<string, string> = {
  weapon: 'w',
  armor: 'a',
  artifact: 'art',
  container: 'c',
  modification: 'mod',
};
const fetchedCards = ref(new Map<string, Record<string, unknown> | null>());
const pendingCards = new Set<string>();
const request = useRequestFetch();

/** Owned rows carry their card; a catalog row fetches it once, keyed by `<prefix>:<name>`. */
function localCard(row: TRow): Record<string, unknown> | null {
  const own = row as unknown as { card?: Record<string, unknown> | null; item?: { card?: Record<string, unknown> | null } };
  return own.card ?? own.item?.card ?? null;
}

async function loadCard(key: string): Promise<void> {
  if (fetchedCards.value.has(key) || pendingCards.has(key)) return;
  pendingCards.add(key);
  try {
    const response = await request<{ data?: Record<string, unknown> }>(`/api/v1/details/${encodeURIComponent(key)}`);
    fetchedCards.value.set(key, response?.data ?? null);
  } catch {
    fetchedCards.value.set(key, null);
  } finally {
    pendingCards.delete(key);
  }
}

const selectedCard = computed(() => {
  const row = selected.value;
  if (!row) return null;
  const own = localCard(row);
  if (own) return own;
  return fetchedCards.value.get(`${CARD_PREFIX[props.kind.key] ?? ''}:${row.name}`) ?? null;
});

function openRow(row: TRow): void {
  selectedKey.value = row.key;
  dialogOpen.value = true;
  if (!localCard(row)) {
    const prefix = CARD_PREFIX[props.kind.key] ?? '';
    void loadCard(`${prefix}:${row.name}`);
  }
}

/** A card in the assistant links here; open the row once its payload arrived, then clear the query. */
watch(
  [rows, () => route.query],
  () => {
    const link = deepLink.value;
    if (!link) return;
    // The row must be visible for `selected` to resolve: an owned id needs the owned tab.
    if (props.kind.modes) filters.mode = link.itemId != null ? 'owned' : 'catalog';
    const row = findRowForDeepLink(rows.value, link);
    if (!row) return;
    openRow(row);
    void router.replace({
      query: withoutInventoryDeepLink(route.query as Record<string, unknown>) as LocationQueryRaw,
    });
  },
  { immediate: true, flush: 'post' },
);

const selectedItem = computed<InventoryItemRead | null>(
  () => (selected.value as unknown as { item?: InventoryItemRead | null } | null)?.item ?? null,
);

async function updateSelected(patch: Record<string, unknown>): Promise<void> {
  const item = selectedItem.value;
  if (item) await inventory.updateItem(item.id, patch);
}

async function removeSelected(qty: number): Promise<void> {
  const item = selectedItem.value;
  if (!item) return;
  const result = await inventory.removeItem(item.id, qty);
  if (result && qty >= item.qty) {
    dialogOpen.value = false;
    selectedKey.value = null;
  }
}

async function installModification(slot: ModificationSlot, modificationItemId: number | null): Promise<void> {
  const weapon = selectedItem.value;
  if (weapon?.kind !== 'weapon') return;
  const result = await inventory.setWeaponModification(weapon.id, slot, modificationItemId);
  if (!result && modificationItemId != null && inventory.lastError.value?.code === 'INCOMPATIBLE_MODIFICATION') {
    pendingUnverified.value = { weaponId: weapon.id, slot, modificationItemId };
  }
}

const pendingUnverified = ref<{ weaponId: number; slot: ModificationSlot; modificationItemId: number } | null>(null);

async function confirmUnverified(): Promise<void> {
  const pending = pendingUnverified.value;
  pendingUnverified.value = null;
  if (pending) await inventory.setWeaponModification(pending.weaponId, pending.slot, pending.modificationItemId, true);
}

async function applyFill(slots: (number | null)[]): Promise<void> {
  const container = selectedItem.value;
  if (container?.kind !== 'container') return;
  await inventory.setContainerFill(container.id, slots);
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
  void loadCard(`art:${name}`);
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


    <ItemDetailsModal
      v-model:open="dialogOpen"
      :kind="props.kind.key"
      :name="selected?.name ?? ''"
      :item="selectedItem"
      :card="selectedCard"
      :row="(selected as unknown as Record<string, unknown> | null)"
      :attachments="modificationCandidates"
      :artifacts="artifactCandidates"
      :busy="inventory.busy.value"
      @update="updateSelected"
      @remove="removeSelected"
      @install="installModification"
      @fill="applyFill"
      @edit="requestEdit"
      @fill-row="requestFill"
      @artifact="openArtifact"
    />

    <UModal
      :open="Boolean(pendingUnverified)"
      :title="t('inventory.unverifiedTitle')"
      :ui="{ content: MODAL_WIDTH.narrow }"
      @update:open="(value) => !value && (pendingUnverified = null)"
    >
      <template #body>
        <p class="text-[12.5px]">{{ t('inventory.unverifiedDesc') }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="pendingUnverified = null" />
          <UButton :loading="inventory.busy.value" :label="t('inventory.unverifiedConfirm')" @click="confirmUnverified" />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="artifactOpen"
      :title="t('items.artifactCardTitle')"
      :description="artifactTarget?.name"
      :ui="{ content: MODAL_WIDTH.reader }"
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
