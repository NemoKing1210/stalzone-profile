import type { InventoryItemRead } from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';

import { visualPlacements } from '~/features/inventory/model/visualGrid';

function item(overrides: Partial<InventoryItemRead> = {}): InventoryItemRead {
  return {
    id: 1,
    itemId: 1,
    name: 'Rifle',
    displayName: null,
    kind: 'weapon',
    category: 'weapon/assault_rifle',
    rank: 'RANK_MASTER',
    level: 0,
    quality: null,
    rarityPct: null,
    rarityTier: null,
    virtual: false,
    qty: 1,
    skinItemId: null,
    icon: null,
    slot: null,
    weight: null,
    size: { width: 2, height: 2 },
    placement: { location: 'grid', storageId: 7, x: 5, y: 4 },
    container: null,
    ...overrides,
  };
}

function orderOf(ids: Map<number, { x: number; y: number }>): number[] {
  return [...ids.entries()]
    .sort(([, a], [, b]) => a.y - b.y || a.x - b.x)
    .map(([id]) => id);
}

describe('visual grid packing', () => {
  it('packs by each tidy order without touching the stored placements', () => {
    const items = [
      item({ id: 3, name: 'Bravo', kind: 'armor', rank: 'RANK_STALKER', size: { width: 1, height: 1 } }),
      item({ id: 1, name: 'Alpha', kind: 'weapon', rank: 'RANK_MASTER', size: { width: 2, height: 2 } }),
      item({ id: 2, name: 'Charlie', kind: 'artifact', rank: 'RANK_NEWBIE', size: { width: 1, height: 2 } }),
    ];
    const stored = items.map((entry) => ({ ...entry.placement }));

    expect(orderOf(visualPlacements(items, { width: 4, height: 6 }, 'name').placements)).toEqual([1, 3, 2]);
    expect(orderOf(visualPlacements(items, { width: 4, height: 6 }, 'kind').placements)).toEqual([3, 2, 1]);
    expect(orderOf(visualPlacements(items, { width: 4, height: 6 }, 'rank').placements)).toEqual([2, 3, 1]);
    expect(orderOf(visualPlacements(items, { width: 4, height: 6 }, 'footprint').placements)).toEqual([1, 2, 3]);
    expect(items.map((entry) => entry.placement)).toEqual(stored);
  });

  it('keeps each item footprint', () => {
    const rotated = item({
      id: 1,
      name: 'A',
      size: { width: 5, height: 2 },
      placement: { location: 'grid', storageId: 7, x: 0, y: 0 },
    });
    const plain = item({ id: 2, name: 'B', size: { width: 1, height: 1 } });
    const grid = visualPlacements([rotated, plain], { width: 8, height: 8 }, 'name');
    expect(grid.placements.get(1)).toEqual({ x: 0, y: 0 });
    expect(grid.placements.get(2)).toEqual({ x: 5, y: 0 });
  });

  it('grows the box instead of dropping an item that does not fit the stored height', () => {
    const tall = item({ id: 1, name: 'A', size: { width: 1, height: 3 } });
    const next = item({ id: 2, name: 'B', size: { width: 2, height: 1 } });
    const grid = visualPlacements([tall, next], { width: 2, height: 2 }, 'name');
    expect(grid.height).toBe(4);
    expect(grid.placements.get(2)).toEqual({ x: 0, y: 3 });
  });

  it('never overlaps two packed rectangles and preserves every item', () => {
    const items = Array.from({ length: 12 }, (_, index) =>
      item({
        id: index + 1,
        name: `Item ${index}`,
        size: { width: 1 + (index % 3), height: 1 + ((index + 1) % 3) },
        placement: { location: 'grid', storageId: 7, x: index % 8, y: index },
      }),
    );
    const grid = visualPlacements(items, { width: 8, height: 8 }, 'footprint');
    expect(grid.placements.size).toBe(items.length);
    const rects = items.map((entry) => {
      const at = grid.placements.get(entry.id)!;
      return { x: at.x, y: at.y, ...entry.size };
    });
    for (let left = 0; left < rects.length; left += 1) {
      for (let right = left + 1; right < rects.length; right += 1) {
        const a = rects[left]!;
        const b = rects[right]!;
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap).toBe(false);
      }
    }
    for (const rect of rects) expect(rect.x + rect.width).toBeLessThanOrEqual(8);
  });
});
