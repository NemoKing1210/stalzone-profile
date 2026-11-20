import type { PlacementRead, PlacementTarget } from '@profile/shared/contracts';

import { cellAt, grabCell, type GridBounds, type Size } from './grid';

/** Where a drag can be dropped: every write target. */
export type DropTarget = PlacementTarget;

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
  return false;
}

/**
 * The rotation a pick starts with. A storage item keeps what it has; an intake item and
 * anything outside a grid start unrotated, because the landing chooses a fresh rotation.
 */
export function pickRotation(placement: PlacementRead, intakeStorageId: number | null): boolean {
  if (placement.location !== 'grid' || placement.storageId === intakeStorageId) return false;
  return placement.rotated;
}

export interface StartSpot {
  ghost: (Point & { storageId: number }) | null;
  target: DropTarget | null;
  rotated: boolean;
}

/**
 * Where a pick starts. A storage item starts on its own cells; an intake item and
 * everything outside a grid start on the home grid, because intake only releases
 * items and the other locations have no cells of their own.
 */
export function startPlacement(
  placement: PlacementRead,
  options: { homeStorageId: number | null; intakeStorageId: number | null },
): StartSpot {
  if (placement.location === 'grid' && placement.storageId !== options.intakeStorageId) {
    const rotated = placement.rotated;
    return {
      ghost: { x: placement.x, y: placement.y, storageId: placement.storageId },
      target: {
        location: 'grid',
        storageId: placement.storageId,
        x: placement.x,
        y: placement.y,
        rotated,
      },
      rotated,
    };
  }
  const home = options.homeStorageId;
  if (home == null) return { ghost: null, target: null, rotated: false };
  return {
    ghost: { x: 0, y: 0, storageId: home },
    target: { location: 'grid', storageId: home, x: 0, y: 0, rotated: false },
    rotated: false,
  };
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

/** The on-screen size of one cell in a grid box measured in pixels. */
export function cellPixels(rect: Size, grid: Size): Size {
  return {
    width: grid.width > 0 ? rect.width / grid.width : 0,
    height: grid.height > 0 ? rect.height / grid.height : 0,
  };
}

/** A grid box measured on screen, with the storage it shows. */
export interface GridBox extends GridBounds {
  storageId: number;
  columns: number;
  rows: number;
}

export interface GridHit {
  storageId: number;
  x: number;
  y: number;
}

/**
 * The grid box under the pointer and the cell inside it. Resolving the target from
 * geometry rather than from the element on top keeps the ghost following the pointer
 * even when a tile, a preview or a pane edge sits above the grid.
 */
export function gridUnder(pointer: Point, boxes: readonly GridBox[]): GridHit | null {
  for (const box of boxes) {
    if (pointer.x < box.left || pointer.x >= box.left + box.width) continue;
    if (pointer.y < box.top || pointer.y >= box.top + box.height) continue;
    const cell = cellAt(pointer.x, pointer.y, box, box.columns, box.rows);
    return { storageId: box.storageId, x: cell.x, y: cell.y };
  }
  return null;
}

export type GrabSource = 'grid' | 'equipment' | 'container' | 'intake';

/** The rectangle an instance is picked from, named by the placement it reads. */
export function sourceOf(placement: PlacementRead, intakeStorageId: number | null): GrabSource {
  if (placement.location === 'grid') {
    return placement.storageId === intakeStorageId ? 'intake' : 'grid';
  }
  if (placement.location === 'equipment') return 'equipment';
  if (placement.location === 'container') return 'container';
  return 'grid';
}

/**
 * The footprint cell held under the pointer. Every source maps its own rectangle onto
 * the footprint, so the card keeps the grabbed cell under the cursor instead of
 * re-centering itself when it is picked up.
 */
export function grabPoint(_source: GrabSource, rect: GridBounds, pointer: Point, size: Size): Point {
  return grabCell(rect, pointer, size);
}

/** Only the primary mouse button picks an item up; a right press opens the menu instead. */
export function isPrimaryButton(button: number): boolean {
  return button === 0;
}

/** The footprint cell at the middle of an item; a slot-sourced card hangs from it. */
export function centerGrab(size: Size): Point {
  return { x: Math.floor(size.width / 2), y: Math.floor(size.height / 2) };
}

export interface PreviewBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The floating drag preview: it follows the pointer at the item's real footprint,
 * holding the cell the pointer grabbed under the cursor. The snapped landing stays
 * with the ghost, so the preview and the ghost answer different questions.
 */
export function previewBox(pointer: Point, grab: Point, cell: Size, size: Size): PreviewBox {
  return {
    left: pointer.x - grab.x * cell.width,
    top: pointer.y - grab.y * cell.height,
    width: size.width * cell.width,
    height: size.height * cell.height,
  };
}
