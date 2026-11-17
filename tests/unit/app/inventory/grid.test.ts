import { describe, expect, it } from 'vitest';
import { canDrop, cellAt, effectiveSize, itemRects, type GridItem } from '~/features/inventory/model/grid';

const grid = { width: 8, height: 8 };

describe('effectiveSize', () => {
  it('swaps the rendered size when rotated', () => {
    expect(effectiveSize({ width: 5, height: 2 }, true)).toEqual({ width: 2, height: 5 });
  });

  it('keeps the size when upright', () => {
    expect(effectiveSize({ width: 5, height: 2 }, false)).toEqual({ width: 5, height: 2 });
  });
});

describe('canDrop', () => {
  it('accepts an empty cell', () => {
    expect(canDrop({ x: 0, y: 0, width: 2, height: 2 }, grid, [])).toBe(true);
  });

  it('rejects a collision', () => {
    expect(
      canDrop({ x: 1, y: 1, width: 2, height: 2 }, grid, [{ x: 0, y: 0, width: 3, height: 3 }]),
    ).toBe(false);
  });

  it('accepts a rectangle that only touches a neighbour edge', () => {
    expect(
      canDrop({ x: 3, y: 0, width: 2, height: 3 }, grid, [{ x: 0, y: 0, width: 3, height: 3 }]),
    ).toBe(true);
  });

  it('rejects a rectangle outside the grid', () => {
    expect(canDrop({ x: 7, y: 0, width: 2, height: 1 }, grid, [])).toBe(false);
    expect(canDrop({ x: -1, y: 0, width: 2, height: 2 }, grid, [])).toBe(false);
  });
});

describe('cellAt', () => {
  const box = { left: 100, top: 50, width: 400, height: 320 };

  it('maps a client point to zero-based cells', () => {
    expect(cellAt(225, 160, box, 8)).toEqual({ x: 2, y: 2 });
    expect(cellAt(100, 50, box, 8)).toEqual({ x: 0, y: 0 });
  });

  it('returns negative coordinates outside the grid', () => {
    expect(cellAt(40, 10, box, 8)).toEqual({ x: -2, y: -1 });
  });
});

describe('itemRects', () => {
  it('collects placed rectangles and applies rotation', () => {
    const items: GridItem[] = [
      { size: { width: 5, height: 2 }, placement: { x: 1, y: 2, rotated: false } },
      { size: { width: 2, height: 3 }, placement: { x: 4, y: 0, rotated: true } },
    ];
    expect(itemRects(items)).toEqual([
      { x: 1, y: 2, width: 5, height: 2 },
      { x: 4, y: 0, width: 3, height: 2 },
    ]);
  });
});
