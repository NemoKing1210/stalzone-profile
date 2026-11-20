import { describe, expect, it } from 'vitest';
import {
  INVENTORY_GRID_HEIGHT,
  INVENTORY_GRID_WIDTH,
  STASH_GRID_HEIGHT,
} from '@profile/shared/contracts';
import { orderTidy, planTidy, type TidyCandidate } from '@profile/core/modules/inventory/layout';

function candidate(
  id: number,
  name: string,
  overrides: Partial<TidyCandidate> = {},
): TidyCandidate {
  return {
    id,
    name,
    kind: 'weapon',
    rank: 'RANK_NEWBIE',
    size: { width: 1, height: 1 },
    original: { x: 0, y: 0, rotated: false },
    ...overrides,
  };
}

describe('shared grid dimensions', () => {
  it('pins the carried grid and every stash to eight cells wide', () => {
    expect(INVENTORY_GRID_WIDTH).toBe(8);
    expect(INVENTORY_GRID_HEIGHT).toBe(20);
    expect(STASH_GRID_HEIGHT).toBe(200);
  });
});

describe('tidy order', () => {
  it('orders by kind, name, rank and footprint', () => {
    const items = [
      candidate(1, 'Б', { kind: 'weapon', rank: 'RANK_MASTER', size: { width: 2, height: 2 } }),
      candidate(2, 'А', { kind: 'armor', rank: 'RANK_NEWBIE', size: { width: 3, height: 3 } }),
      candidate(3, 'В', { kind: 'weapon', rank: 'RANK_LEGEND', size: { width: 1, height: 1 } }),
    ];
    expect(orderTidy(items, 'kind').map((entry) => entry.id)).toEqual([2, 1, 3]);
    expect(orderTidy(items, 'name').map((entry) => entry.id)).toEqual([2, 1, 3]);
    expect(orderTidy(items, 'rank').map((entry) => entry.id)).toEqual([2, 1, 3]);
    expect(orderTidy(items, 'footprint').map((entry) => entry.id)).toEqual([2, 1, 3]);
  });
});

describe('tidy plan', () => {
  it('packs every item into an empty grid without overlap', () => {
    const items = [
      candidate(1, 'A', { size: { width: 2, height: 2 }, original: { x: 4, y: 0, rotated: false } }),
      candidate(2, 'B', { size: { width: 2, height: 2 }, original: { x: 4, y: 4, rotated: false } }),
    ];
    const plan = planTidy({ width: 4, height: 4 }, items, 'name');
    expect(plan.unplaced).toEqual([]);
    expect(plan.placed).toEqual([
      { id: 1, x: 0, y: 0, rotated: false },
      { id: 2, x: 2, y: 0, rotated: false },
    ]);
  });

  it('keeps an item that cannot fit at its original cells and reports it', () => {
    const items = [
      candidate(1, 'Small', { size: { width: 1, height: 1 }, original: { x: 0, y: 0, rotated: false } }),
      candidate(2, 'Wide', { size: { width: 5, height: 2 }, original: { x: 0, y: 1, rotated: false } }),
      candidate(3, 'Other', { size: { width: 1, height: 1 }, original: { x: 1, y: 0, rotated: false } }),
    ];
    const plan = planTidy({ width: 4, height: 4 }, items, 'name');
    expect(plan.unplaced).toEqual([2]);
    const packed = new Map(plan.placed.map((entry) => [entry.id, entry]));
    expect([...packed.keys()].sort()).toEqual([1, 3]);
    expect(packed.get(1)).toMatchObject({ y: 0 });
  });
});
