import { ALL_RANKS } from '~/entities/item/model/rankOptions';
import { findDetailsCard } from '~/entities/item/model/details';

import {
  buildInventoryIndex,
  cardDamage15,
  cardText,
  cardValue,
  locationOf,
  type InstanceLocationRow,
  type InstanceRow,
} from '../instances';
import type { InventoryColumn, InventoryKind } from '../types';

export interface WeaponRow extends InstanceRow, InstanceLocationRow {
  key: string;
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

const EMPTY_LOCATION: Omit<InstanceLocationRow, 'location'> = {
  storageId: null,
  storageName: null,
  storageKind: null,
  parentName: null,
  equipmentSlot: null,
  moduleSlot: null,
  slotIndex: null,
};

export const weaponsKind: InventoryKind<WeaponRow> = {
  key: 'weapon',
  storageKey: 'weapons',
  modes: true,
  defaults: {
    mode: 'owned',
    view: 'grid',
    q: '',
    rank: ALL_RANKS,
    type: 'all',
    group: 'none',
    sort: 'dps',
    dir: 'desc',
  },
  gridTestId: 'weapon-grid',
  gridClass: 'grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
  emptyIcon: 'i-lucide-crosshair',

  toRows(payload, mode = 'owned') {
    if (!payload) return [];
    if (mode === 'catalog') {
      return (payload.catalog?.weapons ?? []).map((entry, index) => ({
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
      }));
    }

    const index = buildInventoryIndex(payload.inventory);
    return index.items
      .filter((item) => item.kind === 'weapon')
      .map((item) => {
        const card = findDetailsCard(payload.details, 'w', item.name);
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
          role: item.role,
          slot: item.slot,
          name: item.displayName ?? item.name,
          rank: item.rank,
          type: cardText(card, 'type') ?? item.category,
          lvl: item.level,
          dmg: cardDamage15(card),
          rof: cardValue(card, 'rof'),
          dps: cardValue(card, 'dps15'),
          ttk: cardValue(card, 'ttk15'),
          mag: cardValue(card, 'mag'),
          caliber: cardText(card, 'caliber'),
          weight: item.weight,
          icon: item.icon,
        };
      });
  },

  columns({ catalog }): InventoryColumn<WeaponRow>[] {
    const columns: InventoryColumn<WeaponRow>[] = [
      { key: 'name', label: 'table.name', sortable: true, strong: true, wide: true },
      { key: 'rank', label: 'table.rank' },
      { key: 'type', label: 'table.type' },
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
    columns.push(
      {
        key: 'dmg',
        label: 'table.damage15',
        sortable: true,
        align: 'right',
        cell: (row, fmt) => (row.dmg == null ? '—' : fmt.g1(row.dmg)),
      },
      {
        key: 'rof',
        label: 'table.rof',
        sortable: true,
        align: 'right',
        cell: (row, fmt) => (row.rof == null ? '—' : fmt.num(row.rof)),
      },
      {
        key: 'dps',
        label: 'DPS +15',
        sortable: true,
        align: 'right',
        strong: true,
        cell: (row, fmt) => (row.dps == null ? '—' : fmt.num(row.dps)),
      },
      {
        key: 'ttk',
        label: 'TTK +15',
        sortable: true,
        align: 'right',
        cell: (row, fmt) => (row.ttk == null ? '—' : fmt.g2(row.ttk)),
      },
      {
        key: 'mag',
        label: 'table.mag',
        sortable: true,
        align: 'right',
        cell: (row, fmt) => (row.mag == null ? '—' : fmt.num(row.mag)),
      },
      { key: 'caliber', label: 'table.caliber' },
      {
        key: 'weight',
        label: 'table.weight',
        sortable: true,
        align: 'right',
        cell: (row, fmt) => (row.weight == null ? '—' : fmt.g2(row.weight)),
      },
    );
    return columns;
  },

  sortOptions: [
    { value: 'dps', label: 'DPS' },
    { value: 'dmg', label: 'table.damage' },
    { value: 'name', label: 'table.name' },
    { value: 'weight', label: 'table.weight' },
    { value: 'ttk', label: 'TTK' },
    { value: 'rof', label: 'table.rof' },
    { value: 'mag', label: 'table.mag' },
    { value: 'lvl', label: 'table.level' },
  ],
  defaultSort: { key: 'dps', dir: 'desc' },
  groupKey: (row) => row.type,
  filterKeys: ['name', 'type', 'caliber', 'rank'],
  labels: {
    pageTitle: 'weapons.pageTitle',
    title: 'weapons.title',
    summary: 'weapons.summary',
    search: 'filters.searchWeapons',
    typeLabel: 'filters.type',
    groupBy: 'filters.groupByType',
    modalTitle: 'items.cardTitle',
    hint: 'weapons.hint',
    emptyOwned: 'weapons.emptyOwned',
    emptyCatalog: 'weapons.emptyCatalog',
  },
  editTarget: (row) =>
    row.instanceId == null || !row.item
      ? null
      : {
          instanceId: row.instanceId,
          itemId: row.item.itemId,
          name: row.name,
          kind: 'weapon',
          level: row.item.level,
          qty: row.qty,
          quality: row.quality,
          skin: null,
          note: row.note,
          role: row.role,
          slot: row.slot,
          rarityPct: row.item.rarityPct,
          rarityTier: row.item.rarityTier,
        },
};
