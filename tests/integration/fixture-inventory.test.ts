import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@profile/core';
import {
  getContainerData,
  getInventoryItem,
  getPlacement,
  listInventoryItems,
  listStorages,
} from '@profile/core/modules/inventory';
import { seedInventory } from '../fixtures/inventory';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-inventory-fixture-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('inventory fixture', () => {
  it('seeds a character, two storages and the equipment tree', () => {
    const seeded = seedInventory(db);
    expect(seeded.storageIds.inventory).toBeGreaterThan(0);
    expect(seeded.storageIds.stash).toBeGreaterThan(0);
    expect(listStorages(db, seeded.characterId).map((row) => row.kind)).toEqual(['inventory', 'stash']);
    expect(listInventoryItems(db, seeded.characterId)).toHaveLength(8);

    expect(getPlacement(db, seeded.instanceIds.rifle)).toMatchObject({
      location: 'equipment',
      equipment_slot: 'primary',
    });
    expect(getPlacement(db, seeded.instanceIds.armor)).toMatchObject({
      location: 'equipment',
      equipment_slot: 'armor',
    });
    expect(getPlacement(db, seeded.instanceIds.backpack)).toMatchObject({
      location: 'equipment',
      equipment_slot: 'container',
    });
    expect(getPlacement(db, seeded.instanceIds.artifact1)).toMatchObject({
      location: 'container',
      container_item_id: seeded.instanceIds.backpack,
      container_slot: 0,
    });
    expect(getPlacement(db, seeded.instanceIds.artifact2)).toMatchObject({ location: 'loose' });
    expect(getContainerData(db, seeded.instanceIds.backpack)).toMatchObject({ slots: 2, eff: 100 });
    expect(getInventoryItem(db, seeded.instanceIds.ammo)?.qty).toBe(30);
  });
});
