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

/** Deterministic first-fit packing: area desc, height desc, id asc. */
export function packItems(grid: Size, items: readonly PackItem[], occupied: readonly Rect[] = []): PackResult {
  const ordered = [...items].sort((a, b) => {
    const area = b.size.width * b.size.height - a.size.width * a.size.height;
    if (area !== 0) return area;
    if (b.size.height !== a.size.height) return b.size.height - a.size.height;
    return a.id - b.id;
  });

  const placed: PackPlacement[] = [];
  const unplaced: number[] = [];
  const taken: Rect[] = [...occupied];

  for (const item of ordered) {
    let position: PackPlacement | null = null;
    for (let y = 0; y <= grid.height - item.size.height && !position; y += 1) {
      for (let x = 0; x <= grid.width - item.size.width && !position; x += 1) {
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
