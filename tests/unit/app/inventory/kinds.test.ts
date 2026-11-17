import { describe, expect, it } from 'vitest';
import type { InventoryItemRead, InventoryRead, RangeValue } from '@profile/shared/contracts';

import { armorKind } from '~/features/inventory/model/kinds/armor';
import { containersKind } from '~/features/inventory/model/kinds/containers';
import { weaponsKind } from '~/features/inventory/model/kinds/weapons';
import { allInventoryItems } from '~/features/inventory/model/instances';

const range: RangeValue = { min: 0, max: 0, value: 0, missing: [] };

function item(partial: Partial<InventoryItemRead> & Pick<InventoryItemRead, 'id' | 'name' | 'kind'>): InventoryItemRead {
  return {
    itemId: partial.id,
    displayName: null,
    category: null,
    rank: 'common',
    level: 0,
    quality: null,
    rarityPct: null,
    rarityTier: null,
    qty: 1,
    skinItemId: null,
    icon: null,
    note: null,
    role: null,
    slot: null,
    weight: null,
    size: { width: 1, height: 1 },
    placement: { location: 'loose' },
    container: null,
    ...partial,
  };
}

const rifleA = item({
  id: 11,
  name: 'AK-12',
  kind: 'weapon',
  category: 'assault rifle',
  placement: { location: 'grid', storageId: 1, x: 0, y: 0, rotated: false },
});
const rifleB = item({
  id: 12,
  name: 'AK-12',
  kind: 'weapon',
  category: 'assault rifle',
  placement: { location: 'grid', storageId: 1, x: 5, y: 0, rotated: false },
});
const artifact = item({
  id: 21,
  name: 'Moonlight',
  kind: 'artifact',
  placement: { location: 'container', containerItemId: 31, slotIndex: 1 },
});
const vest = item({
  id: 22,
  name: 'Vest',
  kind: 'armor',
  placement: { location: 'equipment', slot: 'armor' },
});
const container = item({
  id: 31,
  name: 'Backpack',
  kind: 'container',
  placement: { location: 'grid', storageId: 1, x: 0, y: 3, rotated: false },
  container: { type: 'backpack', shield: null, bonus: null, protection: 10, slots: 4, eff: 100 },
  artifacts: [artifact],
});

const inventory: InventoryRead = {
  storages: [
    {
      id: 1,
      kind: 'inventory',
      name: 'Inventory',
      width: 8,
      height: 10,
      maxWeight: null,
      sortOrder: 0,
      items: [rifleA, rifleB, container],
      weight: range,
      updatedAt: null,
    },
  ],
  equipment: {
    primary: null,
    secondary: null,
    melee: null,
    armor: vest,
    backpack: null,
    container: null,
    quick1: null,
    quick2: null,
    quick3: null,
    quick4: null,
  },
  loose: [],
  stats: {
    carry: {
      base: 50,
      bonus: range,
      total: range,
      safeLimit: range,
      carried: range,
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

const payload = { inventory, details: {} } as never;

describe('instance rows', () => {
  it('collects equipment, grid items, loose items and their children without duplicates', () => {
    const ids = allInventoryItems(inventory).map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([11, 12, 21, 22, 31]));
  });

  it('maps two identical rifles as two rows with their own location', () => {
    const rows = weaponsKind.toRows(payload);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.instanceId)).size).toBe(2);
    expect(rows[0]).toMatchObject({
      name: 'AK-12',
      instanceId: 11,
      location: 'grid',
      storageId: 1,
      storageName: 'Inventory',
    });
  });

  it('labels an equipped item by its slot and a container artifact by its parent', () => {
    const armorRows = armorKind.toRows(payload);
    expect(armorRows[0]).toMatchObject({ location: 'equipment', equipmentSlot: 'armor', storageId: null });

    const containerRows = containersKind.toRows(payload);
    expect(containerRows).toHaveLength(1);
    expect(containerRows[0].artifacts).toEqual([{ name: 'Moonlight', lvl: 0 }]);
  });

  it('keeps catalog rows without an instance or location', () => {
    const rows = weaponsKind.toRows(
      { inventory, details: {}, catalog: { weapons: [{ name: 'M4', dps15: 100 }] } } as never,
      'catalog',
    );
    expect(rows[0]).toMatchObject({ name: 'M4', instanceId: null, location: null, storageId: null });
  });

  it('adds a location column to every table', () => {
    for (const kind of [weaponsKind, armorKind, containersKind]) {
      expect(kind.columns({ mode: 'owned', catalog: false }).map((column) => column.key)).toContain('location');
    }
  });
});
