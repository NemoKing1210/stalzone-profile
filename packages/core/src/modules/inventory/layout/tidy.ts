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
      fixed.set(id, itemRect(item.original.x, item.original.y, item.size));
    }
  }
}
