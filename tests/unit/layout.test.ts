import { describe, expect, it } from 'vitest';
import {
  defaultSize,
  findCollision,
  fits,
  itemRect,
  overlaps,
  packItems,
  resolveSize,
  resolveWeight,
} from '@profile/core/modules/inventory/layout';

describe('packItems rotation bounds', () => {
  it('tries a rotated placement below the unrotated height bound', () => {
    const occupied = [
      { x: 0, y: 0, width: 2, height: 4 },
      { x: 2, y: 0, width: 6, height: 6 },
    ];
    const { placed, unplaced } = packItems(
      { width: 8, height: 8 },
      [{ id: 1, size: { width: 2, height: 5 } }],
      occupied,
    );
    expect(unplaced).toEqual([]);
    expect(placed).toEqual([{ id: 1, x: 0, y: 6, rotated: true }]);
  });
});

describe('inventory layout', () => {
  it('uses category sizes and lets an override win', () => {
    expect(defaultSize('weapon', 'weapon/assault_rifle')).toEqual({ width: 5, height: 2 });
    expect(resolveSize('weapon', 'weapon/assault_rifle', { width: 4, height: 2 })).toEqual({ width: 4, height: 2 });
  });

  it('treats a layout weight as an override of the catalog weight', () => {
    expect(resolveWeight(3.8, 4)).toBe(4);
    expect(resolveWeight(3.8, null)).toBe(3.8);
    expect(resolveWeight(null, null)).toBeNull();
  });

  it('swaps dimensions when rotated', () => {
    expect(itemRect(1, 2, { width: 5, height: 2 }, true)).toEqual({ x: 1, y: 2, width: 2, height: 5 });
  });

  it('does not treat an edge-touching rectangle as overlapping', () => {
    expect(overlaps({ x: 0, y: 0, width: 2, height: 2 }, { x: 2, y: 0, width: 2, height: 2 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, width: 2, height: 2 }, { x: 1, y: 1, width: 2, height: 2 })).toBe(true);
  });

  it('rejects a rect outside the grid and reports the first collision', () => {
    expect(fits({ width: 8, height: 8 }, { x: 7, y: 0, width: 2, height: 1 })).toBe(false);
    expect(findCollision({ x: 1, y: 1, width: 2, height: 2 }, [{ x: 2, y: 2, width: 2, height: 2 }])).toEqual({
      x: 2,
      y: 2,
      width: 2,
      height: 2,
    });
  });

  it('packs deterministically and leaves non-fitting items unplaced', () => {
    const result = packItems({ width: 4, height: 2 }, [
      { id: 2, size: { width: 2, height: 2 } },
      { id: 1, size: { width: 2, height: 2 } },
      { id: 3, size: { width: 3, height: 3 } },
    ]);
    expect(result.placed.map((p) => p.id)).toEqual([1, 2]);
    expect(result.unplaced).toEqual([3]);
    expect(result.placed[0]).toEqual({ id: 1, x: 0, y: 0, rotated: false });
  });
});
