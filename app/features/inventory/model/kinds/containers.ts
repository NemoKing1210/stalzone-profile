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
import type { InventoryKind } from '../types';

export interface ContainerRow extends InstanceRow, InstanceLocationRow {
  key: string;
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

/** `card.prot` may be a per-type record; the table column shows only a scalar value. */
function protection(card: Record<string, unknown> | null): number | null {
  const value = card?.prot;
  return typeof value === 'number' ? value : null;
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
    const index = buildInventoryIndex(payload.inventory);
    return index.items
      .filter((item) => item.kind === 'container')
      .map((item) => {
        const card = findDetailsCard(payload.details, 'c', item.name);
        const data = item.container;
        const artifacts = (item.artifacts ?? []).map((artifact) => ({
          name: artifact.displayName ?? artifact.name,
          lvl: artifact.level,
        }));
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
          type: data?.type ?? cardText(card, 'type') ?? item.category,
          weight: item.weight,
          slots: data?.slots ?? cardValue(card, 'slots'),
          eff: data?.eff ?? cardValue(card, 'eff'),
          fill: artifacts.length,
          prot: data?.protection ?? protection(card),
          shield: data?.shield ?? cardValue(card, 'shield'),
          bonus: data?.bonus ?? cardText(card, 'bonus'),
          icon: item.icon,
          artifacts,
          artifactsAsOf: null,
        };
      });
  },

  columns: () => [
    { key: 'name', label: 'table.name', sortable: true, strong: true, wide: true },
    { key: 'type', label: 'table.type' },
    { key: 'rank', label: 'table.rank' },
    { key: 'location', label: 'table.location' },
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
    row.instanceId == null || !row.item
      ? null
      : {
          instanceId: row.instanceId,
          itemId: row.item.itemId,
          name: row.name,
          kind: 'container',
          level: row.item.level,
          qty: row.qty,
          quality: row.quality,
          skin: null,
          note: row.note,
          role: null,
          slot: null,
          rarityPct: row.item.rarityPct,
          rarityTier: row.item.rarityTier,
          container: row.item.container
            ? {
                type: row.item.container.type,
                shield: row.item.container.shield,
                bonus: row.item.container.bonus,
                protection: row.item.container.protection,
                slots: row.item.container.slots,
                eff: row.item.container.eff,
              }
            : null,
        },
  fillTarget: (row) => (row.item?.kind === 'container' ? { container: row.item } : null),
};
