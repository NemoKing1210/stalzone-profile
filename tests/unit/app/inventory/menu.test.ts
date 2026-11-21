import type { EquipmentRead, InventoryItemRead, PlacementRead, StorageRead } from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';
import { equipmentSlotsFor } from '@profile/shared/contracts';
import { equipTarget, moveDestinations, quickMove } from '~/features/inventory/model/menu';

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

function storage(
  id: number,
  kind: StorageRead['kind'],
  items: InventoryItemRead[],
  size = { width: 2, height: 2 },
): StorageRead {
  return {
    id,
    kind,
    name: `Storage ${id}`,
    width: size.width,
    height: size.height,
    maxWeight: null,
    sortOrder: id,
    items,
    weight: { min: 0, max: 0, value: 0, missing: [] },
    updatedAt: null,
  };
}

describe('moveDestinations', () => {
  const pack = item(1, { location: 'grid', storageId: 10, x: 0, y: 0 });
  const inventory = storage(10, 'inventory', [pack]);
  const stash = storage(11, 'stash', []);
  const intake = storage(12, 'overflow', []);

  it('skips the intake and the storage the item already sits in', () => {
    const ids = moveDestinations(pack, [inventory, stash, intake]).map((entry) => entry.storage.id);
    expect(ids).toEqual([11]);
  });

  it('offers the inventory and stashes to an equipped item', () => {
    const equipped = item(2, { location: 'equipment', slot: 'primary' });
    const entries = moveDestinations(equipped, [inventory, stash, intake]);
    expect(entries.map((entry) => entry.storage.id)).toEqual([10, 11]);
    expect(entries.every((entry) => entry.spot !== null)).toBe(true);
  });

  it('keeps a full storage in the list with no free spot', () => {
    const blocker = item(3, { location: 'grid', storageId: 11, x: 0, y: 0 }, {
      size: { width: 2, height: 2 },
    });
    const full = storage(11, 'stash', [blocker]);
    const entry = moveDestinations(pack, [full]).find((candidate) => candidate.storage.id === 11);
    expect(entry).toEqual({ storage: full, spot: null });
  });
});

function equipment(overrides: Partial<EquipmentRead> = {}): EquipmentRead {
  return {
    primary: null,
    secondary: null,
    melee: null,
    armor: null,
    backpack: null,
    container: null,
    quick1: null,
    quick2: null,
    quick3: null,
    quick4: null,
    ...overrides,
  };
}

describe('equipmentSlotsFor', () => {
  it('sends a firearm to the weapon slots', () => {
    expect(equipmentSlotsFor(item(1, { location: 'loose' }, { category: 'weapon/shotgun' }))).toEqual(['primary']);
  });

  it('puts a melee weapon in the melee slot first', () => {
    expect(equipmentSlotsFor(item(1, { location: 'loose' }, { category: 'weapon/melee' }))).toEqual(['melee']);
  });

  it('maps armor, backpacks and artifact containers to their own slots', () => {
    expect(equipmentSlotsFor(item(1, { location: 'loose' }, { kind: 'armor' }))).toEqual(['armor']);
    expect(equipmentSlotsFor(item(1, { location: 'loose' }, { kind: 'container', category: 'backpacks' }))).toEqual([
      'backpack',
    ]);
    expect(equipmentSlotsFor(item(1, { location: 'loose' }, { kind: 'container', category: 'containers' }))).toEqual([
      'container',
    ]);
  });

  it('offers the quick slots to ammo and misc items', () => {
    expect(equipmentSlotsFor(item(1, { location: 'loose' }, { kind: 'ammo' }))).toEqual([
      'quick1',
      'quick2',
      'quick3',
      'quick4',
    ]);
  });

  it('rejects kinds the equipment slots do not take', () => {
    expect(equipmentSlotsFor(item(1, { location: 'loose' }, { kind: 'artifact' }))).toEqual([]);
    expect(equipmentSlotsFor(item(1, { location: 'loose' }, { kind: 'container', category: null }))).toEqual([]);
  });
});

describe('equipTarget', () => {
  it('sends a pistol to the empty secondary slot', () => {
    expect(equipTarget(item(2, { location: 'loose' }, { category: 'weapon/pistol' }), equipment())).toEqual({
      slot: 'secondary',
    });
  });

  it('keeps a pistol in the secondary slot when it is occupied', () => {
    const secondary = item(2, { location: 'equipment', slot: 'secondary' });
    expect(
      equipTarget(item(3, { location: 'loose' }, { category: 'weapon/pistol' }), equipment({ secondary })),
    ).toEqual({ slot: 'secondary' });
  });

  it('does nothing for an item that is already worn', () => {
    expect(equipTarget(item(1, { location: 'equipment', slot: 'armor' }, { kind: 'armor' }), equipment())).toBeNull();
  });
});


describe('quickMove', () => {
  const home = storage(10, 'inventory', []);
  const stash = storage(11, 'stash', []);

  function context(overrides: Partial<Parameters<typeof quickMove>[1]> = {}) {
    return { pane: 'equipment' as const, home, stash, equipment: equipment(), ...overrides };
  }

  it('sends a carried tile to the selected stash', () => {
    const carried = item(1, { location: 'grid', storageId: 10, x: 0, y: 0 });
    expect(quickMove(carried, context({ pane: 'stash' }))).toEqual({
      target: { location: 'grid', storageId: 11, x: 0, y: 0 },
      blocked: null,
    });
  });

  it('brings a stash tile back to the first free carried cell', () => {
    const blocker = item(2, { location: 'grid', storageId: 10, x: 0, y: 0 });
    const carried = storage(10, 'inventory', [blocker]);
    const stored = item(3, { location: 'grid', storageId: 11, x: 0, y: 0 });
    expect(quickMove(stored, context({ pane: 'stash', home: carried }))).toEqual({
      target: { location: 'grid', storageId: 10, x: 1, y: 0 },
      blocked: null,
    });
  });

  it('releases an intake tile into the carried grid', () => {
    const intake = storage(12, 'overflow', []);
    const released = item(4, { location: 'grid', storageId: 12, x: 0, y: 0 });
    expect(quickMove(released, context({ pane: 'stash', stash: intake }))).toEqual({
      target: { location: 'grid', storageId: 10, x: 0, y: 0 },
      blocked: null,
    });
  });

  it('never puts a carried tile into the intake', () => {
    const intake = storage(12, 'overflow', []);
    const carried = item(1, { location: 'grid', storageId: 10, x: 0, y: 0 });
    expect(quickMove(carried, context({ pane: 'stash', stash: intake }))).toEqual({
      target: null,
      blocked: 'intake',
    });
  });

  it('equips a carried weapon through the first compatible slot', () => {
    const gun = item(5, { location: 'grid', storageId: 10, x: 0, y: 0 }, {
      category: 'weapon/pistol',
    });
    expect(quickMove(gun, context())).toEqual({ target: { location: 'equipment', slot: 'secondary' }, blocked: null });
  });

  it('returns a worn item to the carried grid', () => {
    const vest = item(6, { location: 'equipment', slot: 'armor' }, { kind: 'armor' });
    expect(quickMove(vest, context())).toEqual({
      target: { location: 'grid', storageId: 10, x: 0, y: 0 },
      blocked: null,
    });
  });

  it('refuses an item the equipment slots do not accept', () => {
    const gem = item(7, { location: 'grid', storageId: 10, x: 0, y: 0 }, { kind: 'artifact' });
    expect(quickMove(gem, context())).toEqual({ target: null, blocked: 'incompatible' });
  });

  it('refuses a full destination', () => {
    const carried = item(1, { location: 'grid', storageId: 10, x: 0, y: 0 });
    const blocker = item(8, { location: 'grid', storageId: 11, x: 0, y: 0 }, {
      size: { width: 2, height: 2 },
    });
    const full = storage(11, 'stash', [blocker]);
    expect(quickMove(carried, context({ pane: 'stash', stash: full }))).toEqual({ target: null, blocked: 'full' });
  });

  it('reports a missing carried storage instead of writing', () => {
    const vest = item(6, { location: 'equipment', slot: 'armor' }, { kind: 'armor' });
    expect(quickMove(vest, context({ home: null }))).toEqual({ target: null, blocked: 'no-home' });
  });
});
