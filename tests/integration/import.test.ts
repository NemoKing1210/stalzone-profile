import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  exportProfileJson,
  getItemLayout,
  migrate,
  moveInventoryItem,
  openDb,
  setItemLayout,
  type Db,
} from '@profile/core';
import { ProfileExportSchema } from '@profile/shared/contracts';
import { seedCatalog } from '../fixtures/seed';
import { seedInventory, type SeedInventory } from '../fixtures/inventory';

let dir: string;
let db: Db;
let seeded: SeedInventory;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-import-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  seedCatalog(db);
  seeded = seedInventory(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('profile export round-trip', () => {
  it('serializes storages, items, placements and container data', () => {
    moveInventoryItem(
      db,
      seeded.instanceIds.smg!,
      { location: 'grid', storageId: seeded.storageIds.inventory, x: 1, y: 2, rotated: false },
      { dryRun: false },
    );
    const exported = exportProfileJson(db);
    const parsed = ProfileExportSchema.parse(JSON.parse(JSON.stringify(exported)));
    const inventory = parsed.inventory;

    expect(inventory.storages.map((storage) => storage.kind)).toEqual(['inventory', 'stash']);
    expect(inventory.equipment.primary?.name).toBe('АК-12');
    expect(inventory.equipment.container?.artifacts?.[0]?.name).toBe('Нервяк');
    expect(inventory.equipment.container?.container).toMatchObject({ slots: 2, eff: 100 });

    const looseNames = inventory.loose.map((item) => item.name);
    expect(looseNames).toContain('Патроны 5.45');
    expect(looseNames).not.toContain('ПП-19');

    const gridItem = inventory.storages[0]!.items[0];
    expect(gridItem?.name).toBe('ПП-19');
    expect(gridItem?.placement).toMatchObject({
      location: 'grid',
      storageId: inventory.storages[0]!.id,
      x: 1,
      y: 2,
    });
  });

  it('carries layout overrides for the character items', () => {
    const itemId = Number(
      (
        db.prepare(`SELECT item_id AS id FROM inventory_item WHERE id = ?`).get(seeded.instanceIds.rifle) as {
          id: number;
        }
      ).id,
    );
    setItemLayout(db, itemId, { width: 4, height: 3, weight: 4.5 }, { dryRun: false });
    expect(getItemLayout(db, itemId)).toMatchObject({ width: 4, height: 3 });

    const parsed = ProfileExportSchema.parse(JSON.parse(JSON.stringify(exportProfileJson(db))));
    const primary = parsed.inventory.equipment.primary!;
    expect(primary.size).toEqual({ width: 4, height: 3 });
    expect(primary.weight).toBe(4.5);
  });
});
