import type { InventoryItemRead } from '@profile/shared/contracts';
import { orderTidy, type TidyOrder } from '@profile/shared/inventory-order';

import { effectiveSize } from './grid';

export interface VisualPlacement {
  x: number;
  y: number;
}

export interface VisualGrid {
  /** Synthetic cells for the visible items; the stored placements are untouched. */
  placements: Map<number, VisualPlacement>;
  /** `max(storage height, packed bottom)`, so packing never drops an item. */
  height: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * A view-only packing of the items a filter leaves visible: the chosen tidy order, each
 * item's footprint, first fit row by row from the top-left. Nothing is written, so
 * clearing the filter instantly restores the stored cells.
 */
export function visualPlacements(
  items: readonly InventoryItemRead[],
  grid: { width: number; height: number },
  order: TidyOrder,
): VisualGrid {
  const width = Math.max(1, grid.width);
  const ordered = orderTidy(
    items.map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.displayName ?? item.name,
      rank: item.rank,
      size: item.size,
      item,
    })),
    order,
  );
  const taken: Rect[] = [];
  const placements = new Map<number, VisualPlacement>();
  let bottom = 0;

  for (const entry of ordered) {
    const size = effectiveSize(entry.size);
    const w = Math.min(size.width, width);
    const h = size.height;
    let spot: VisualPlacement | null = null;
    for (let y = 0; !spot; y += 1) {
      for (let x = 0; x + w <= width; x += 1) {
        const rect = { x, y, width: w, height: h };
        if (!taken.some((placed) => overlaps(rect, placed))) {
          spot = { x, y };
          taken.push(rect);
          bottom = Math.max(bottom, y + h);
          break;
        }
      }
    }
    placements.set(entry.id, spot);
  }

  return { placements, height: Math.max(grid.height, bottom) };
}
