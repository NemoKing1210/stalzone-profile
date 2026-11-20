/**
 * Pure geometry for the inventory grid: no DOM, no Vue, no storage access.
 * The components own the pixels; these functions own the cells.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

export interface GridPlacement {
  x: number;
  y: number;
  rotated: boolean;
}

/** The subset of an inventory item the grid needs to draw it. */
export interface GridItem {
  size: Size;
  placement: GridPlacement;
}

/** The dashed preview drawn where a picked item would land. */
export interface GridGhostPreview extends Rect {
  valid: boolean;
}

/** The measurable part of a `DOMRect`; plain objects work in tests. */
export interface GridBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A rotated item swaps its rendered width and height. */
export function effectiveSize(size: Size, rotated: boolean): Size {
  return rotated ? { width: size.height, height: size.width } : { width: size.width, height: size.height };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** True when the rectangle is inside the grid and touches no other item. */
export function canDrop(rect: Rect, grid: Size, others: readonly Rect[]): boolean {
  if (rect.x < 0 || rect.y < 0) return false;
  if (rect.x + rect.width > grid.width || rect.y + rect.height > grid.height) return false;
  return !others.some((other) => overlaps(rect, other));
}

/**
 * Maps a pointer position to a zero-based cell; a point outside the grid is negative.
 * The row height comes from `rows` when it is known; without it the cells are assumed
 * square, which is the historical behavior for callers that only know the columns.
 */
export function cellAt(
  clientX: number,
  clientY: number,
  grid: GridBounds,
  columns: number,
  rows?: number,
): { x: number; y: number } {
  if (columns <= 0 || grid.width <= 0 || grid.height <= 0) return { x: -1, y: -1 };
  const cellWidth = grid.width / columns;
  const cellHeight = rows != null && rows > 0 ? grid.height / rows : cellWidth;
  return {
    x: Math.floor((clientX - grid.left) / cellWidth),
    y: Math.floor((clientY - grid.top) / cellHeight),
  };
}

/** Keeps an item's origin inside the grid so a drag near an edge cannot leave it. */
export function clampOrigin(origin: { x: number; y: number }, size: Size, grid: Size): { x: number; y: number } {
  const maxX = Math.max(0, grid.width - size.width);
  const maxY = Math.max(0, grid.height - size.height);
  return {
    x: Math.min(Math.max(0, origin.x), maxX),
    y: Math.min(Math.max(0, origin.y), maxY),
  };
}

/** The cell of an item's footprint the pointer grabbed, so the drop keeps that cell under the pointer. */
export function grabCell(rect: GridBounds, point: { x: number; y: number }, size: Size): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: Math.floor(size.width / 2), y: Math.floor(size.height / 2) };
  return {
    x: Math.min(Math.max(0, Math.floor(((point.x - rect.left) / rect.width) * size.width)), size.width - 1),
    y: Math.min(Math.max(0, Math.floor(((point.y - rect.top) / rect.height) * size.height)), size.height - 1),
  };
}

/** Every placed item as a grid rectangle, in the same order as the input. */
export function itemRects(items: readonly GridItem[]): Rect[] {
  return items.map((item) => {
    const size = effectiveSize(item.size, item.placement.rotated);
    return { x: item.placement.x, y: item.placement.y, ...size };
  });
}

/**
 * The first cell a row-by-row scan reaches where the item fits, upright before rotated.
 * The item itself is ignored, so a menu can re-pack an item already inside the storage.
 */
export function firstFreeSpot(
  grid: Size,
  item: { id?: number; size: Size },
  items: readonly (GridItem & { id: number })[],
): GridPlacement | null {
  const others = itemRects(items.filter((entry) => entry.id !== item.id));
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      for (const rotated of [false, true]) {
        const size = effectiveSize(item.size, rotated);
        if (rotated && size.width === item.size.width && size.height === item.size.height) continue;
        if (canDrop({ x, y, ...size }, grid, others)) return { x, y, rotated };
      }
    }
  }
  return null;
}

/**
 * The ghost a picked item would draw at a cell, and whether that landing is allowed.
 * The picked item does not collide with itself, so hovering its own cells stays valid.
 */
export function ghostForGrid(
  grid: Size,
  picked: { id: number; size: Size },
  ghost: { x: number; y: number },
  rotated: boolean,
  items: readonly (GridItem & { id: number })[],
): GridGhostPreview {
  const size = effectiveSize(picked.size, rotated);
  const rect = { x: ghost.x, y: ghost.y, ...size };
  const others = itemRects(items.filter((item) => item.id !== picked.id));
  return { ...rect, valid: canDrop(rect, grid, others) };
}
