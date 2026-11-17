import { ALL_RANKS } from '~/entities/item/model/rankOptions';
import { findDetailsCard } from '~/entities/item/model/details';

import {
  buildInventoryIndex,
  cardText,
  cardValue,
  locationOf,
  type InstanceLocationRow,
  type InstanceRow,
} from '../instances';
import type { InventoryColumn, InventoryKind } from '../types';

export interface ArmorRow extends InstanceRow, InstanceLocationRow {
  key: string;
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

const EMPTY_LOCATION: Omit<InstanceLocationRow, 'location'> = {
  storageId: null,
  storageName: null,
  parentName: null,
  equipmentSlot: null,
  moduleSlot: null,
  slotIndex: null,
};

export const armorKind: InventoryKind<ArmorRow> = {
  key: 'armor',
  storageKey: 'armor',
  modes: true,
  defaults: {
    mode: 'owned',
    view: 'grid',
    q: '',
    rank: ALL_RANKS,
    type: 'all',
    group: 'none',
    sort: 'armor',
    dir: 'desc',
  },
  gridTestId: 'armor-grid',
  gridClass: 'grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
  emptyIcon: 'i-lucide-shield',

  toRows(payload, mode = 'owned') {
    if (!payload) return [];
    if (mode === 'catalog') {
      return (payload.catalog?.armor ?? []).map((entry, index) => ({
        key: `catalog-${index}-${entry.name}`,
        instanceId: null,
        item: null,
        placement: null,
        location: null,
        ...EMPTY_LOCATION,
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
      }));
    }

    const index = buildInventoryIndex(payload.inventory);
    return index.items
      .filter((item) => item.kind === 'armor')
      .map((item) => {
        const card = findDetailsCard(payload.details, 'a', item.name);
        return {
          key: `instance-${item.id}`,
          instanceId: item.id,
          item,
          placement: item.placement,
          ...locationOf(item, index),
          qty: item.qty,
          quality: item.quality,
          // The instance carries the skin id, not its name; the editor leaves it untouched.
          skin: null,
          note: item.note,
          name: item.displayName ?? item.name,
          rank: item.rank,
          cls: cardText(card, 'cls') ?? item.category,
          lvl: item.level,
          armor: cardValue(card, 'armor15') ?? cardValue(card, 'armor'),
          armor15: cardValue(card, 'armor15'),
          weight: item.weight,
          icon: item.icon,
        };
      });
  },

  columns({ catalog }): InventoryColumn<ArmorRow>[] {
    const columns: InventoryColumn<ArmorRow>[] = [
      { key: 'name', label: 'table.name', sortable: true, strong: true, wide: true },
      { key: 'rank', label: 'table.rank' },
      { key: 'cls', label: 'table.class' },
    ];
    if (!catalog) {
      columns.push({
        key: 'lvl',
        label: 'table.level',
        sortable: true,
        align: 'right',
        cell: (row) => (row.lvl == null ? '—' : `+${row.lvl}`),
      });
      columns.push({ key: 'location', label: 'table.location' });
    }
    columns.push({
      key: 'armor',
      label: 'table.armor',
      sortable: true,
      align: 'right',
      strong: true,
      cell: (row, fmt) => (row.armor == null ? '—' : fmt.g1(row.armor)),
    });
    if (!catalog) {
      columns.push({
        key: 'armor15',
        label: '+15',
        sortable: true,
        align: 'right',
        cell: (row, fmt) => (row.armor15 == null ? '—' : fmt.g1(row.armor15)),
      });
    }
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
    { value: 'armor', label: 'table.armor' },
    { value: 'armor15', label: '+15' },
    { value: 'weight', label: 'table.weight' },
    { value: 'name', label: 'table.name' },
    { value: 'lvl', label: 'table.level' },
  ],
  defaultSort: { key: 'armor', dir: 'desc' },
  groupKey: (row) => row.cls,
  filterKeys: ['name', 'cls', 'rank'],
  labels: {
    pageTitle: 'armor.pageTitle',
    title: 'armor.title',
    summary: 'armor.summary',
    search: 'filters.searchArmor',
    typeLabel: 'table.class',
    groupBy: 'filters.groupByClass',
    modalTitle: 'items.cardTitle',
    hint: 'armor.hint',
    emptyOwned: 'armor.emptyOwned',
    emptyCatalog: 'armor.emptyCatalog',
  },
  editTarget: (row) =>
    row.instanceId == null || !row.item
      ? null
      : {
          instanceId: row.instanceId,
          itemId: row.item.itemId,
          name: row.name,
          kind: 'armor',
          level: row.item.level,
          qty: row.qty,
          quality: row.quality,
          skin: null,
          note: row.note,
          role: null,
          slot: null,
          rarityPct: row.item.rarityPct,
          rarityTier: row.item.rarityTier,
        },
};
