import type { Size } from './defaults.js';
import { findCollision, fits, itemRect, type Rect } from './geometry.js';

export interface PackItem {
  id: number;
  size: Size;
}

export interface PackPlacement {
  id: number;
  x: number;
  y: number;
  rotated: boolean;
}

export interface PackResult {
  placed: PackPlacement[];
  unplaced: number[];
}

/** The historical packing order: area desc, height desc, id asc. */
export function packOrder(a: PackItem, b: PackItem): number {
  const area = b.size.width * b.size.height - a.size.width * a.size.height;
  if (area !== 0) return area;
  if (b.size.height !== a.size.height) return b.size.height - a.size.height;
  return a.id - b.id;
}

/** Deterministic first-fit packing: area desc, height desc, id asc. */
export function packItems(grid: Size, items: readonly PackItem[], occupied: readonly Rect[] = []): PackResult {
  return packOrdered(grid, [...items].sort(packOrder), occupied);
}

/** Same first-fit scan in the caller's order; tidy-up supplies its own comparator. */
export function packOrdered(grid: Size, ordered: readonly PackItem[], occupied: readonly Rect[] = []): PackResult {
  const placed: PackPlacement[] = [];
  const unplaced: number[] = [];
  const taken: Rect[] = [...occupied];

  for (const item of ordered) {
    let position: PackPlacement | null = null;
    // Both orientations are tried at each origin, so the scan must reach every origin
    // where the smaller dimension fits — not only where the unrotated one does.
    const minSide = Math.min(item.size.width, item.size.height);
    for (let y = 0; y <= grid.height - minSide && !position; y += 1) {
      for (let x = 0; x <= grid.width - minSide && !position; x += 1) {
        for (const rotated of [false, true]) {
          if (rotated && item.size.width === item.size.height) continue;
          const rect = itemRect(x, y, item.size, rotated);
          if (fits(grid, rect) && !findCollision(rect, taken)) {
            position = { id: item.id, x, y, rotated };
            taken.push(rect);
            break;
          }
        }
      }
    }
    if (position) placed.push(position);
    else unplaced.push(item.id);
  }

  return { placed, unplaced };
}
