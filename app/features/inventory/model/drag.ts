import type { PlacementRead, PlacementTarget } from '@profile/shared/contracts';

import { cellAt, type GridBounds, type Size } from './grid';

/** Where a drag can be dropped: every write target plus the loose tray. */
export type DropTarget = PlacementTarget | { location: 'loose' };

export interface Point {
  x: number;
  y: number;
}

export interface Ghost extends Point {
  rotated: boolean;
}

const ARROWS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * The keyboard ghost move: one cell per arrow press, clamped so the origin stays
 * inside the grid, and `R` toggles rotation without moving the origin. Validity
 * (bounds of the whole rectangle, collisions) is decided by `canDrop` on drop.
 */
export function keyboardTarget(start: Point, key: string, size: Size, rotated: boolean, grid: Size): Ghost {
  const delta = ARROWS[key];
  if (delta) {
    return {
      x: clamp(start.x + delta.x, 0, Math.max(0, grid.width - 1)),
      y: clamp(start.y + delta.y, 0, Math.max(0, grid.height - 1)),
      rotated,
    };
  }
  if (key === 'r' || key === 'R') return { x: start.x, y: start.y, rotated: !rotated };
  return { x: start.x, y: start.y, rotated };
}

/** True when a drop target is exactly where the item already is, so no write is needed. */
export function isSameTarget(placement: PlacementRead, target: DropTarget): boolean {
  if (placement.location !== target.location) return false;
  if (placement.location === 'grid' && target.location === 'grid') {
    return (
      placement.storageId === target.storageId &&
      placement.x === target.x &&
      placement.y === target.y &&
      placement.rotated === target.rotated
    );
  }
  if (placement.location === 'equipment' && target.location === 'equipment') {
    return placement.slot === target.slot;
  }
  if (placement.location === 'container' && target.location === 'container') {
    return placement.containerItemId === target.containerItemId && placement.slotIndex === target.slot;
  }
  if (placement.location === 'weapon_module' && target.location === 'weapon_module') {
    return placement.weaponItemId === target.weaponItemId && placement.slot === target.slot;
  }
  return placement.location === 'loose' && target.location === 'loose';
}

/** The parts of a pointer event the cell math needs; plain objects work in tests. */
export interface PointerPosition {
  clientX: number;
  clientY: number;
}

/** The part of an element the cell math needs; plain objects work in tests. */
export interface MeasuredElement {
  getBoundingClientRect(): GridBounds;
}

/** A pointer position expressed in the grid's zero-based cells. */
export function pointerToCell(event: PointerPosition, element: MeasuredElement, columns: number): Point {
  const rect = element.getBoundingClientRect();
  return cellAt(event.clientX, event.clientY, rect, columns);
}
