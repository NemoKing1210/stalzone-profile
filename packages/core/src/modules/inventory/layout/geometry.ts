import type { Size } from './defaults.js';

export interface Rect extends Size {
  x: number;
  y: number;
}

export function itemRect(x: number, y: number, size: Size): Rect {
  return { x, y, width: size.width, height: size.height };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function fits(grid: Size, rect: Rect): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= grid.width && rect.y + rect.height <= grid.height;
}

export function findCollision(rect: Rect, placed: readonly Rect[]): Rect | null {
  return placed.find((candidate) => overlaps(rect, candidate)) ?? null;
}
