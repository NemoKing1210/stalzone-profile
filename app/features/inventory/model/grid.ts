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

/** Maps a pointer position to a zero-based cell; a point outside the grid is negative. */
export function cellAt(clientX: number, clientY: number, grid: GridBounds, columns: number): { x: number; y: number } {
  if (columns <= 0 || grid.width <= 0 || grid.height <= 0) return { x: -1, y: -1 };
  const cell = grid.width / columns;
  return {
    x: Math.floor((clientX - grid.left) / cell),
    y: Math.floor((clientY - grid.top) / cell),
  };
}

/** Every placed item as a grid rectangle, in the same order as the input. */
export function itemRects(items: readonly GridItem[]): Rect[] {
  return items.map((item) => {
    const size = effectiveSize(item.size, item.placement.rotated);
    return { x: item.placement.x, y: item.placement.y, ...size };
  });
}
