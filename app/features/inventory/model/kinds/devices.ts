import { ALL_RANKS } from '~/entities/item/model/rankOptions';
import type { InventoryKind } from '../types';

/** One device-category catalog row: a detector, night vision or another gadget. */
export interface DeviceRow {
  key: string;
  name: string;
  rank: string | null;
  type: string | null;
  category: string;
  weight: number | null;
  icon: string | null;
}

/** `/devices` lists the catalog's device-category rows; they are never owned gear rows. */
export const devicesKind: InventoryKind<DeviceRow> = {
  key: 'device',
  storageKey: 'devices',
  modes: false,
  defaults: {
    mode: '',
    view: 'list',
    q: '',
    rank: ALL_RANKS,
    type: 'all',
    group: 'none',
    sort: 'name',
    dir: 'asc',
  },
  gridTestId: 'device-grid',
  gridClass: 'grid gap-2 sm:grid-cols-2 xl:grid-cols-3',
  emptyIcon: 'i-lucide-radar',

  toRows(payload) {
    const devices = payload?.catalog?.devices ?? [];
    return devices.map((device, index) => ({
      key: `device-${index}-${device.name}`,
      name: device.name,
      rank: device.rank ?? null,
      type: device.type ?? device.category ?? null,
      category: device.category ?? 'device/device',
      weight: device.weight ?? null,
      icon: device.icon ?? null,
    }));
  },

  columns: () => [
    { key: 'icon', label: '', icon: (row) => row.icon },
    { key: 'name', label: 'table.name', sortable: true, strong: true, wide: true },
    { key: 'type', label: 'table.type' },
    { key: 'rank', label: 'table.rank', sortable: true },
    {
      key: 'weight',
      label: 'table.weight',
      sortable: true,
      align: 'right',
      cell: (row, fmt) => (row.weight == null ? '—' : fmt.g2(row.weight)),
    },
  ],

  sortOptions: [
    { value: 'name', label: 'devices.sortName' },
    { value: 'type', label: 'devices.sortType' },
    { value: 'rank', label: 'devices.sortRank' },
  ],
  defaultSort: { key: 'name', dir: 'asc' },
  groupKey: (row) => row.type,
  filterKeys: ['name', 'type'],
  labels: {
    pageTitle: 'devices.pageTitle',
    title: 'devices.title',
    summary: 'devices.summary',
    search: 'filters.searchDevices',
    typeLabel: 'filters.type',
    groupBy: 'filters.groupByType',
    modalTitle: 'items.deviceCardTitle',
    emptyOwned: 'devices.emptyDescription',
    emptyCatalog: 'devices.emptyDescription',
  },
  editTarget: () => null,
};
