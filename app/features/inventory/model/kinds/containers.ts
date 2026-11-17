import { ALL_RANKS } from '~/entities/item/model/rankOptions';

import type { InventoryKind } from '../types';

export interface ContainerRow {
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
  artifacts: { name: string; lvl: number }[];
  artifactsAsOf: string | null;
}

export const containersKind: InventoryKind<ContainerRow> = {
  key: 'container',
  storageKey: 'containers',
  modes: false,
  defaults: {
    mode: '',
    view: 'grid',
    q: '',
    rank: ALL_RANKS,
    type: 'all',
    group: 'none',
    sort: 'name',
    dir: 'asc',
  },
  gridTestId: 'container-grid',
  gridClass: 'grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
  emptyIcon: 'i-lucide-backpack',

  toRows(payload) {
    if (!payload) return [];
    return (payload.containers ?? []).map((container, index) => ({
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
      artifacts: container.artifacts,
      artifactsAsOf: container.artifactsAsOf,
    }));
  },

  columns: () => [
    { key: 'name', label: 'table.name', sortable: true, strong: true, wide: true },
    { key: 'type', label: 'table.type' },
    { key: 'rank', label: 'table.rank' },
    {
      key: 'slots',
      label: 'table.slots',
      sortable: true,
      align: 'right',
      cell: (row, fmt) => (row.slots == null ? '—' : fmt.num(row.slots)),
    },
    { key: 'fill', label: 'table.fill', sortable: true, align: 'right', cell: (row) => `${row.fill} / ${row.slots ?? '—'}` },
    {
      key: 'eff',
      label: 'table.efficiency',
      sortable: true,
      align: 'right',
      cell: (row, fmt) => (row.eff == null ? '—' : `${fmt.g1(row.eff)}%`),
    },
    {
      key: 'weight',
      label: 'table.weight',
      sortable: true,
      align: 'right',
      cell: (row, fmt) => (row.weight == null ? '—' : fmt.g2(row.weight)),
    },
  ],

  sortOptions: [
    { value: 'name', label: 'containers.sortName' },
    { value: 'weight', label: 'containers.sortWeight' },
    { value: 'slots', label: 'containers.sortSlots' },
    { value: 'eff', label: 'containers.sortEfficiency' },
    { value: 'fill', label: 'containers.sortFill' },
  ],
  defaultSort: { key: 'name', dir: 'asc' },
  groupKey: (row) => row.type,
  filterKeys: ['name', 'type', 'bonus'],
  labels: {
    pageTitle: 'containers.pageTitle',
    title: 'containers.title',
    summary: 'containers.summary',
    search: 'filters.searchContainers',
    typeLabel: 'filters.type',
    groupBy: 'filters.groupByType',
    modalTitle: 'containers.detailTitle',
    emptyOwned: 'containers.emptyDescription',
    emptyCatalog: 'containers.emptyDescription',
  },
  editTarget: (row) =>
    row.ownedId == null
      ? null
      : {
          ownedId: row.ownedId,
          name: row.name,
          kind: 'container',
          level: 0,
          qty: row.qty,
          quality: row.quality,
          skin: row.skin,
          note: row.note,
          role: null,
          slot: null,
          container: {
            containerType: row.type,
            shield: row.shield,
            bonus: row.bonus,
            protection: row.prot,
            slots: row.slots,
            eff: row.eff,
          },
        },
  fillTarget: (row) =>
    row.ownedId == null
      ? null
      : {
          ownedId: row.ownedId,
          name: row.name,
          artifacts: row.artifacts,
          artifactsAsOf: row.artifactsAsOf,
        },
};
