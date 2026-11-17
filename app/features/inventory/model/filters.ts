import { ALL_RANKS } from '~/entities/item/model/rankOptions';

import { groupRows } from './groupRows';

export interface InventorySection<TRow> {
  key: string;
  label: string | null;
  rows: TRow[];
}

export function resolveSortKey(sort: string, allowed: string[], fallback: string): string {
  return allowed.includes(sort) ? sort : fallback;
}

/** Rank, type and free-text filtering shared by every inventory kind. */
export function filterInventoryRows<TRow extends { name: string; rank: string | null }>(
  rows: TRow[],
  filters: { q: string; rank: string; type: string },
  filterKeys: (keyof TRow & string)[],
  groupKey?: (row: TRow) => string | null | undefined,
): TRow[] {
  const query = filters.q.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.rank !== ALL_RANKS && row.rank !== filters.rank) return false;
    if (filters.type !== 'all' && groupKey && groupKey(row) !== filters.type) return false;
    if (!query) return true;
    return filterKeys
      .map((key) => row[key])
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

/** Nulls always sort last, numbers numerically and everything else with a numeric-aware locale sort. */
export function sortInventoryRows<TRow>(rows: TRow[], key: string, dir: string): TRow[] {
  const direction = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = (a as unknown as Record<string, unknown>)[key];
    const right = (b as unknown as Record<string, unknown>)[key];
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
    return String(left).localeCompare(String(right), 'ru', { numeric: true }) * direction;
  });
}

export function inventorySections<TRow>(
  rows: TRow[],
  group: string,
  groupKey: ((row: TRow) => string | null | undefined) | undefined,
  fallbackLabel: string,
): InventorySection<TRow>[] {
  if (group === 'type' && groupKey) {
    return groupRows(rows, groupKey, fallbackLabel);
  }
  return [{ key: '__all', label: null, rows }];
}

/** Distinct type/class values across the visible sections, sorted for stable options. */
export function typeOptions<TRow>(
  rows: TRow[],
  groupKey: ((row: TRow) => string | null | undefined) | undefined,
  allLabel: string,
): { label: string; value: string }[] {
  if (!groupKey) return [{ label: allLabel, value: 'all' }];
  const values = [...new Set(rows.map((row) => groupKey(row)).filter((value): value is string => Boolean(value)))];
  values.sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  return [{ label: allLabel, value: 'all' }, ...values.map((value) => ({ label: value, value }))];
}
