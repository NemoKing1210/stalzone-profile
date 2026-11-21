import { orderTidy, type TidyOrder } from '@profile/shared/inventory-order';

import { itemRect, type Rect } from './geometry.js';
import { packOrdered, type PackItem, type PackPlacement } from './pack.js';
import type { Size } from './defaults.js';

export type { TidyOrder };
export { orderTidy };

export interface TidyCandidate extends PackItem {
  kind: string;
  name: string;
  rank: string | null;
  /** The placement the item has now; kept untouched when it cannot be packed. */
  original: Omit<PackPlacement, 'id'>;
}

export interface TidyPlan {
  placed: PackPlacement[];
  /** Items left at their original placement because they did not fit. */
  unplaced: number[];
  order: TidyOrder;
}

/** The explicit order the owner picks in the tidy-up action; ids break every tie. */
export function orderTidy(items: readonly TidyCandidate[], order: TidyOrder): TidyCandidate[] {
  const compare = (a: TidyCandidate, b: TidyCandidate): number => {
    if (order === 'name') return a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' });
    if (order === 'rank') {
      const keyA = rankKey(a.rank);
      const keyB = rankKey(b.rank);
      const weightA = keyA ? RANK_ORDER.indexOf(keyA) : RANK_ORDER.length;
      const weightB = keyB ? RANK_ORDER.indexOf(keyB) : RANK_ORDER.length;
      return (
        weightA - weightB ||
        a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' })
      );
    }
    if (order === 'footprint') {
      const areaA = a.size.width * a.size.height;
      const areaB = b.size.width * b.size.height;
      return (
        areaB - areaA ||
        b.size.height - a.size.height ||
        b.size.width - a.size.width ||
        a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' })
      );
    }
    return (
      a.kind.localeCompare(b.kind, 'en') ||
      a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' })
    );
  };
  return [...items].sort((a, b) => compare(a, b) || a.id - b.id);
}

/**
 * Packs every candidate in the chosen order. An item that cannot be packed keeps its
 * original rectangle and becomes an obstacle for the next pass; repeating until the
 * plan is stable guarantees that no packed item overlaps an untouched one.
 */
export function planTidy(grid: Size, items: readonly TidyCandidate[], order: TidyOrder): TidyPlan {
  const ordered = orderTidy(items, order);
  const byId = new Map(ordered.map((item) => [item.id, item]));
  const fixed = new Map<number, Rect>();

  for (;;) {
    const movable = ordered.filter((item) => !fixed.has(item.id));
    const result = packOrdered(grid, movable, [...fixed.values()]);
    if (!result.unplaced.length) {
      return { placed: result.placed, unplaced: [...fixed.keys()], order };
    }
    for (const id of result.unplaced) {
      const item = byId.get(id);
      if (!item) continue;
      fixed.set(id, itemRect(item.original.x, item.original.y, item.size, item.original.rotated));
    }
  }
}
