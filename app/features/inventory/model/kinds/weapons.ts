import { ALL_RANKS } from '~/entities/item/model/rankOptions';

import type { InventoryColumn, InventoryKind } from '../types';

export interface WeaponRow {
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
      }));
    }
    return (payload.weapons ?? []).map((weapon, index) => ({
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
    }));
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
    }
    columns.push(
      {
        key: 'dmg',
        label: catalog ? 'table.damage15' : 'table.damage',
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
        label: 'DPS',
        sortable: true,
        align: 'right',
        strong: true,
        cell: (row, fmt) => (row.dps == null ? '—' : fmt.num(row.dps)),
      },
      {
        key: 'ttk',
        label: 'TTK',
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
    row.ownedId == null
      ? null
      : {
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
        },
};
