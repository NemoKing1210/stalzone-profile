import { ALL_RANKS } from '~/entities/item/model/rankOptions';

import type { InventoryKind } from '../types';

export interface ArtifactRow {
  key: string;
  ownedId: number | null;
  qty: number;
  quality: string | null;
  skin: string | null;
  note: string | null;
  name: string;
  type: string | null;
  q: string | null;
  lvl: number;
  effects: string | null;
  rank: string | null;
  icon: string | null;
}

export const artifactsKind: InventoryKind<ArtifactRow> = {
  key: 'artifact',
  storageKey: 'artifacts',
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
  gridTestId: 'artifact-grid',
  gridClass: 'grid gap-2 lg:grid-cols-2 2xl:grid-cols-3',
  emptyIcon: 'i-lucide-gem',

  toRows(payload) {
    if (!payload) return [];
    return (payload.artifacts ?? []).map((artifact) => ({
      key: `${artifact.name}-${artifact.lvl}`,
      ownedId: artifact.ownedId ?? null,
      qty: artifact.qty ?? 1,
      quality: artifact.quality ?? null,
      skin: artifact.skin ?? null,
      note: artifact.note ?? null,
      name: artifact.name,
      type: artifact.type ?? null,
      q: artifact.q ?? null,
      lvl: artifact.lvl,
      effects: artifact.effects ?? null,
      rank: artifact.rank ?? null,
      icon: artifact.icon ?? null,
    }));
  },

  columns: () => [
    { key: 'name', label: 'table.name', sortable: true, strong: true, wide: true },
    { key: 'type', label: 'table.type' },
    { key: 'rank', label: 'table.rank', sortable: true },
    {
      key: 'lvl',
      label: 'table.level',
      sortable: true,
      align: 'right',
      cell: (row) => (row.lvl == null ? '—' : `+${row.lvl}`),
    },
    { key: 'q', label: 'table.quality', cell: (row) => row.q ?? '—' },
    { key: 'effects', label: 'table.effects', truncate: true, cell: (row) => row.effects ?? '—' },
  ],

  sortOptions: [
    { value: 'name', label: 'artifacts.sortName' },
    { value: 'lvl', label: 'artifacts.sortLevel' },
    { value: 'rank', label: 'artifacts.sortRank' },
  ],
  defaultSort: { key: 'name', dir: 'asc' },
  groupKey: (row) => row.type,
  filterKeys: ['name', 'type', 'effects'],
  labels: {
    pageTitle: 'artifacts.pageTitle',
    title: 'artifacts.title',
    summary: 'artifacts.summary',
    search: 'filters.searchArtifacts',
    typeLabel: 'filters.type',
    groupBy: 'filters.groupByType',
    modalTitle: 'items.artifactCardTitle',
    hint: 'artifacts.hint',
    emptyOwned: 'artifacts.emptyDescription',
    emptyCatalog: 'artifacts.emptyDescription',
  },
  editTarget: (row) =>
    row.ownedId == null
      ? null
      : {
          ownedId: row.ownedId,
          name: row.name,
          kind: 'artifact',
          level: row.lvl,
          qty: row.qty,
          quality: row.quality,
          skin: row.skin,
          note: row.note,
          role: null,
          slot: null,
        },
};
