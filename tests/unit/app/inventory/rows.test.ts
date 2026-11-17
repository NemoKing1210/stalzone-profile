import { describe, expect, it } from 'vitest';
import type { InventoryItemRead, InventoryRead, RangeValue } from '@profile/shared/contracts';

import { weaponsKind } from '~/features/inventory/model/kinds/weapons';

const range: RangeValue = { min: 0, max: 0, value: 0, missing: [] };

const rifle: InventoryItemRead = {
  id: 7,
  itemId: 70,
  name: 'AK',
  displayName: null,
  kind: 'weapon',
  category: 'assault rifle',
  rank: 'common',
  level: 15,
  quality: null,
  rarityPct: null,
  rarityTier: null,
  qty: 2,
  skinItemId: null,
  icon: null,
  note: null,
  role: null,
  slot: 'primary',
  weight: 4.2,
  size: { width: 5, height: 2 },
  placement: { location: 'grid', storageId: 1, x: 0, y: 0, rotated: false },
  container: null,
};

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
      items: [rifle],
      weight: range,
      updatedAt: null,
    },
  ],
  equipment: {
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

describe('inventory row mapping', () => {
  it('maps an owned instance without inventing card numbers', () => {
    const rows = weaponsKind.toRows({ inventory, details: {} } as never);
    expect(rows[0]).toMatchObject({
      name: 'AK',
      instanceId: 7,
      qty: 2,
      lvl: 15,
      dps: null,
      dmg: null,
      storageId: 1,
      storageName: 'Inventory',
    });
    expect(rows[0].key).toBe('instance-7');
  });

  it('returns an empty array for a missing section', () => {
    expect(weaponsKind.toRows({} as never)).toEqual([]);
  });

  it('maps catalog rows with the +15 numbers and no instance fields', () => {
    const payload = {
      inventory,
      catalog: { weapons: [{ name: 'M4', dps15: 100, dmg15: 10, rank: 'rare', type: 'rifle' }] },
    } as never;
    const rows = weaponsKind.toRows(payload, 'catalog');
    expect(rows[0]).toMatchObject({ name: 'M4', instanceId: null, lvl: null, dps: 100, dmg: 10 });
  });
});
