import { ALL_RANKS } from '~/entities/item/model/rankOptions';

import {
  buildInventoryIndex,
  cardText,
  locationOf,
  type InstanceLocationRow,
  type InstanceRow,
} from '../instances';
import type { InventoryKind } from '../types';

export interface ArtifactRow extends InstanceRow, InstanceLocationRow {
  key: string;
  qty: number;
  quality: string | null;
  skin: string | null;
  name: string;
  type: string | null;
  q: string | null;
  lvl: number;
  effects: string | null;
  rank: string | null;
  weight: number | null;
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
    const index = buildInventoryIndex(payload.inventory);
    return index.items
      .filter((item) => item.kind === 'artifact')
      .map((item) => {
        const card = (item.card as Record<string, unknown> | null | undefined) ?? null;
        return {
          key: `instance-${item.id}`,
          instanceId: item.id,
          item,
          virtual: item.virtual,
          placement: item.placement,
          ...locationOf(item, index),
          qty: item.qty,
          quality: item.quality,
          // The instance carries the skin id, not its name; the editor leaves it untouched.
          skin: null,
          name: item.displayName ?? item.name,
          type: cardText(card, 'type') ?? item.category,
          q: item.quality,
          lvl: item.level,
          effects: cardText(card, 'effects'),
          rank: item.rank,
          weight: item.weight,
          icon: item.icon,
        };
      });
  },

  columns: () => [
    { key: 'icon', label: '', icon: (row) => row.icon },
    { key: 'name', label: 'table.name', sortable: true, strong: true, wide: true },
    { key: 'type', label: 'table.type' },
    { key: 'rank', label: 'table.rank', sortable: true },
    { key: 'location', label: 'table.location' },
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
    emptyOwned: 'artifacts.emptyDescription',
    emptyCatalog: 'artifacts.emptyDescription',
  },
  editTarget: (row) =>
    row.instanceId == null || !row.item
      ? null
      : {
          instanceId: row.instanceId,
          itemId: row.item.itemId,
          name: row.name,
          kind: 'artifact',
          level: row.item.level,
          qty: row.qty,
          quality: row.quality,
          skin: null,
          slot: null,
          rarityPct: row.item.rarityPct,
          rarityTier: row.item.rarityTier,
          virtual: row.item.virtual,
        },
};
