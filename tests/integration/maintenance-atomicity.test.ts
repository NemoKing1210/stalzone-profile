import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearInventory,
  closeDb,
  inventoryCounts,
  listEvents,
  migrate,
  openDb,
  rollbackEvent,
  type Db,
} from '@profile/core';
import { inventoryCleanupSnapshot } from '@profile/core/modules/inventory';
import { seedCatalog } from '../fixtures/seed';
import { seedInventory } from '../fixtures/inventory';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-maintenance-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  seedCatalog(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('maintenance atomicity', () => {
  it('writes exactly one event for clearInventory and restores it in one rollback', () => {
    const seeded = seedInventory(db);
    const snapshot = inventoryCleanupSnapshot(db, seeded.characterId);
    const before = listEvents(db).length;

    const cleared = clearInventory(db, false);
    expect(listEvents(db).length).toBe(before + 1);
    expect(inventoryCounts(db, seeded.characterId)).toEqual({ items: 0, storages: 2, placements: 0 });

    const rolled = rollbackEvent(db, cleared.eventId!, false);
    expect(rolled.dryRun).toBe(false);
    expect(listEvents(db).length).toBe(before + 2);
    expect(inventoryCleanupSnapshot(db, seeded.characterId)).toEqual(snapshot);
  });
});
