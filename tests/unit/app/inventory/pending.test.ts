import type {
  InventoryItemRead,
  InventoryRead,
  PlacementRead,
  StorageRead,
} from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';
import { applyPending, clearPending, relocateItem } from '~/features/inventory/model/pending';

function item(id: number, placement: PlacementRead, extra: Partial<InventoryItemRead> = {}): InventoryItemRead {
  return {
    id,
    itemId: id,
    name: `Item ${id}`,
    displayName: null,
    kind: 'weapon',
    category: null,
    rank: null,
    level: 0,
    quality: null,
    rarityPct: null,
    rarityTier: null,
    virtual: false,
    qty: 1,
    skinItemId: null,
    icon: null,
    slot: null,
    weight: 1,
    size: { width: 1, height: 1 },
    placement,
    container: null,
    ...extra,
  };
}

function storage(id: number, kind: StorageRead['kind'], items: InventoryItemRead[]): StorageRead {
  return {
    id,
    kind,
    name: `Storage ${id}`,
    width: 8,
    height: 20,
    maxWeight: null,
    sortOrder: id,
    items,
    weight: { min: 0, max: 0, value: 0, missing: [] },
    updatedAt: null,
  };
}

function fixture(): InventoryRead {
  return {
    storages: [
      storage(1, 'inventory', [item(10, { location: 'grid', storageId: 1, x: 0, y: 0 })]),
      storage(2, 'stash', []),
    ],
    equipment: {
      primary: item(20, { location: 'equipment', slot: 'primary' }),
      secondary: null,
      melee: null,
      armor: null,
      backpack: item(50, { location: 'equipment', slot: 'backpack' }, {
        kind: 'container',
        artifacts: [item(30, { location: 'container', containerItemId: 50, slotIndex: 0 }, { kind: 'artifact' })],
      }),
      container: null,
      quick1: null,
      quick2: null,
      quick3: null,
      quick4: null,
    },
    loose: [item(40, { location: 'loose' })],
    stats: {
      carry: {
        base: 0,
        bonus: { min: 0, max: 0, value: 0, missing: [] },
        total: { min: 0, max: 0, value: 0, missing: [] },
        safeLimit: { min: 0, max: 0, value: 0, missing: [] },
        carried: { min: 0, max: 0, value: 0, missing: [] },
        aboveSafe: null,
        overweight: null,
      },
      storages: {},
      protection: {},
      effects: {},
      containers: [],
      warnings: [],
    },
    updatedAt: null,
  };
}

function itemOf(inventory: InventoryRead, id: number): InventoryItemRead | null {
  const roots: InventoryItemRead[] = [
    ...inventory.storages.flatMap((entry) => entry.items),
    ...Object.values(inventory.equipment).filter((entry): entry is InventoryItemRead => entry !== null),
    ...inventory.loose,
  ];
  for (const root of roots) {
    for (const item of walk([root])) if (item.id === id) return item;
  }
  return null;
}

function* walk(items: readonly InventoryItemRead[]): Generator<InventoryItemRead> {
  for (const item of items) {
    yield item;
    yield* walk(item.artifacts ?? []);
    yield* walk(item.modifications ?? []);
  }
}

describe('relocateItem', () => {
  it('moves a grid item inside the same storage', () => {
    const next = relocateItem(fixture(), 10, { location: 'grid', storageId: 1, x: 3, y: 4 });
    expect(itemOf(next, 10)?.placement).toEqual({ location: 'grid', storageId: 1, x: 3, y: 4 });
    expect(next.storages[0]?.items.filter((entry) => entry.id === 10)).toHaveLength(1);
  });

  it('moves a grid item to another storage', () => {
    const next = relocateItem(fixture(), 10, { location: 'grid', storageId: 2, x: 0, y: 0 });
    expect(next.storages[0]?.items.some((entry) => entry.id === 10)).toBe(false);
    expect(next.storages[1]?.items.some((entry) => entry.id === 10)).toBe(true);
  });

  it('equips an item and swaps the occupant back to the old cell', () => {
    const next = relocateItem(fixture(), 10, { location: 'equipment', slot: 'primary' });
    expect(next.equipment.primary?.id).toBe(10);
    expect(next.equipment.primary?.placement).toEqual({ location: 'equipment', slot: 'primary' });
    expect(next.storages[0]?.items.find((entry) => entry.id === 20)?.placement).toEqual({
      location: 'grid',
      storageId: 1,
      x: 0,
      y: 0,
    });
  });

  it('pulls an artifact out of a container', () => {
    const next = relocateItem(fixture(), 30, { location: 'grid', storageId: 2, x: 1, y: 1 });
    expect(next.storages[1]?.items.some((entry) => entry.id === 30)).toBe(true);
    expect(next.equipment.backpack?.artifacts).toHaveLength(0);
  });

  it('returns the same inventory for an unknown id', () => {
    const base = fixture();
    expect(relocateItem(base, 999, { location: 'grid', storageId: 2, x: 0, y: 0 })).toBe(base);
  });
});

describe('applyPending', () => {
  it('applies moves in order', () => {
    const next = applyPending(fixture(), [
      { itemId: 10, target: { location: 'grid', storageId: 2, x: 1, y: 1 } },
      { itemId: 20, target: { location: 'grid', storageId: 2, x: 5, y: 5 } },
    ]);
    expect(next.storages[1]?.items.map((entry) => entry.id).sort()).toEqual([10, 20]);
  });
});

describe('clearPending', () => {
  const target = { location: 'grid' as const, storageId: 2, x: 0, y: 0 };

  it('keeps a move whose write has not settled yet', () => {
    expect(clearPending([{ itemId: 10, target }], 5)).toHaveLength(1);
  });

  it('keeps a move that settled after the refresh started', () => {
    const moves = [
      { itemId: 10, target, settledAt: 6 },
      { itemId: 20, target, settledAt: 3 },
    ];
    expect(clearPending(moves, 5).map((move) => move.itemId)).toEqual([10]);
  });

  it('clears a move the answered refresh can already see', () => {
    const moves = [
      { itemId: 10, target, settledAt: 2 },
      { itemId: 20, target, settledAt: 4 },
    ];
    expect(clearPending(moves, 5)).toEqual([]);
  });

  it('never clears an in-flight move, even when a newer refresh answers', () => {
    const moves = [
      { itemId: 10, target },
      { itemId: 20, target, settledAt: 1 },
    ];
    expect(clearPending(moves, 9).map((move) => move.itemId)).toEqual([10]);
  });

  it('keeps a settled move the refreshed payload has not applied yet', () => {
    const moves = [{ itemId: 10, target, settledAt: 2 }];

    expect(clearPending(moves, 5, fixture())).toHaveLength(1);
    expect(clearPending(moves, 5, relocateItem(fixture(), 10, target))).toEqual([]);
  });

  it('clears a settled move the payload shows at its equipment slot', () => {
    const moves = [{ itemId: 20, target: { location: 'equipment' as const, slot: 'primary' as const }, settledAt: 2 }];

    expect(clearPending(moves, 5, fixture())).toEqual([]);
  });
});
