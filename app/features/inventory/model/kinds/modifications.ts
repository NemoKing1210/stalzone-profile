import { modificationSlotFor } from '@profile/shared/modifications';
import { ALL_RANKS } from '~/entities/item/model/rankOptions';
import { buildInventoryIndex, locationOf, type InstanceLocationRow, type InstanceRow } from '../instances';
import type { InventoryColumn, InventoryKind } from '../types';

export interface ModificationRow extends InstanceRow, InstanceLocationRow {
  key: string;
  qty: number;
  quality: string | null;
  skin: string | null;
  name: string;
  rank: string | null;
  slot: string;
  category: string | null;
  weight: number | null;
  icon: string | null;
}

const EMPTY_LOCATION: Omit<InstanceLocationRow, 'location'> = {
  storageId: null,
  storageName: null,
  storageKind: null,
  parentName: null,
  equipmentSlot: null,
  modificationSlot: null,
  slotIndex: null,
};

export const modificationsKind: InventoryKind<ModificationRow> = {
  key: 'modification',
  storageKey: 'modifications',
  modes: true,
  defaults: {
    mode: 'owned',
    view: 'grid',
    q: '',
    rank: ALL_RANKS,
    type: 'all',
    group: 'none',
    sort: 'name',
    dir: 'asc',
  },
  gridTestId: 'modification-grid',
  gridClass: 'grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
  emptyIcon: 'i-lucide-wrench',

  toRows(payload, mode = 'owned') {
    if (!payload) return [];
    if (mode === 'catalog') {
      return (payload.catalog?.modifications ?? []).map((entry, index) => ({
        key: `catalog-${index}-${entry.name}`,
        instanceId: null,
        item: null,
        virtual: false,
        placement: null,
        location: null,
        ...EMPTY_LOCATION,
        qty: 1,
        quality: null,
        skin: null,
        name: entry.name,
        rank: entry.rank ?? null,
        slot: entry.slot ?? modificationSlotFor(entry.category),
        category: entry.category ?? null,
        weight: entry.weight ?? null,
        icon: entry.icon ?? null,
      }));
    }

    const index = buildInventoryIndex(payload.inventory);
    return index.items
      .filter((item) => item.kind === 'modification')
      .map((item) => {
        const location = locationOf(item, index);
        return {
          key: `instance-${item.id}`,
          instanceId: item.id,
          item,
          virtual: item.virtual,
          placement: item.placement,
          ...location,
          qty: item.qty,
          quality: item.quality,
          // The instance carries the skin id, not its name; a modification has no skin input.
          skin: null,
          name: item.displayName ?? item.name,
          rank: item.rank,
          slot: location.modificationSlot ?? modificationSlotFor(item.category),
          category: item.category,
          weight: item.weight,
          icon: item.icon,
        };
      });
  },

  columns({ catalog }): InventoryColumn<ModificationRow>[] {
    const columns: InventoryColumn<ModificationRow>[] = [
      { key: 'icon', label: '', icon: (row) => row.icon },
      { key: 'name', label: 'table.name', sortable: true, strong: true, wide: true },
      { key: 'rank', label: 'table.rank' },
      { key: 'slot', label: 'table.slot', sortable: true },
    ];
    if (!catalog) columns.push({ key: 'location', label: 'table.location' });
    columns.push({
      key: 'weight',
      label: 'table.weight',
      sortable: true,
      align: 'right',
      cell: (row, fmt) => (row.weight == null ? '—' : fmt.g2(row.weight)),
    });
    return columns;
  },

  sortOptions: [
    { value: 'name', label: 'table.name' },
    { value: 'weight', label: 'table.weight' },
  ],
  defaultSort: { key: 'name', dir: 'asc' },
  groupKey: (row) => row.slot,
  groupLabel: (value) => `inventory.modification.${value}`,
  allGroupLabel: 'filters.allSlots',
  groupFallback: 'filters.noSlot',
  filterKeys: ['name', 'category'],
  labels: {
    pageTitle: 'modifications.pageTitle',
    title: 'modifications.title',
    summary: 'modifications.summary',
    search: 'filters.searchModifications',
    typeLabel: 'filters.slot',
    groupBy: 'filters.groupBySlot',
    modalTitle: 'items.cardTitle',
    emptyOwned: 'modifications.emptyOwned',
    emptyCatalog: 'modifications.emptyCatalog',
  },
  editTarget: (row) =>
    row.instanceId == null || !row.item
      ? null
      : {
          instanceId: row.instanceId,
          itemId: row.item.itemId,
          name: row.name,
          kind: 'modification',
          level: row.item.level,
          qty: row.qty,
          quality: row.quality,
          skin: null,
          slot: row.item.slot,
          rarityPct: row.item.rarityPct,
          rarityTier: row.item.rarityTier,
          virtual: row.item.virtual,
        },
};
