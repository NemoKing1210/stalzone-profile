import type {
  ProfilePayload,
  ContainerFillTarget,
  InstanceEditTarget,
} from '~/shared/types/profile';

import type { BarValue } from './comparisonBars';

/** Number and date formatting the table cells and cards use; mirrors `useFormat`. */
export interface FormatFns {
  g1: (value: number | null | undefined) => string;
  g2: (value: number | null | undefined) => string;
  num: (value: number | null | undefined) => string;
  /** A comparison bar for the visible set, or null when the column has no scale. */
  bar?: (metric: string, key: string) => BarValue | null;
}

/** Persisted per-screen filter state; `mode` is empty for screens without owned/catalog tabs. */
export interface InventoryFilterState {
  mode: string;
  view: string;
  q: string;
  rank: string;
  type: string;
  group: string;
  sort: string;
  dir: string;
}

export interface InventorySortOption {
  value: string;
  /** i18n key, or a literal such as DPS that reads the same in every locale. */
  label: string;
}

export interface InventoryColumn<TRow> {
  key: keyof TRow & string;
  /** i18n key resolved by the screen. */
  label: string;
  sortable?: boolean;
  align?: 'right';
  strong?: boolean;
  wide?: boolean;
  truncate?: boolean;
  /** Plain-text cell; a null result falls back to the raw value. Rank-like cells use the UI registry. */
  cell?: (row: TRow, fmt: FormatFns) => string | null;
  /** A decorative row icon; a null result renders an em dash in a fixed-size cell. */
  icon?: (row: TRow) => string | null;
  /** A thin comparison bar drawn under the cell value. */
  bar?: (row: TRow, fmt: FormatFns) => BarValue | null;
}

export interface InventoryLabels {
  pageTitle: string;
  title: string;
  summary: string;
  search: string;
  typeLabel: string;
  groupBy: string;
  modalTitle: string;
  emptyOwned: string;
  emptyCatalog: string;
}

export interface InventoryColumnContext {
  mode: string;
  catalog: boolean;
}

/**
 * A kind's data and presentation contract. It stays free of `.vue` imports so row
 * mapping and filtering run in Node tests; the UI components are bound by
 * `ui/kinds/registry.ts`.
 */
export interface InventoryKind<TRow extends { key: string; name: string; rank: string | null }> {
  key: 'weapon' | 'armor' | 'artifact' | 'container';
  /** localStorage key for the persisted filters; keeps the pre-feature keys. */
  storageKey: string;
  /** True for screens with owned/catalog tabs. */
  modes: boolean;
  defaults: InventoryFilterState;
  gridTestId: string;
  gridClass: string;
  emptyIcon: string;
  toRows: (payload: ProfilePayload | null, mode?: string) => TRow[];
  columns: (context: InventoryColumnContext) => InventoryColumn<TRow>[];
  sortOptions: InventorySortOption[];
  defaultSort: { key: string; dir: 'asc' | 'desc' };
  groupKey?: (row: TRow) => string | null | undefined;
  filterKeys: (keyof TRow & string)[];
  labels: InventoryLabels;
  editTarget: (row: TRow) => InstanceEditTarget | null;
  /** Present only when the kind can edit a container fill. */
  fillTarget?: (row: TRow) => ContainerFillTarget | null;
}
