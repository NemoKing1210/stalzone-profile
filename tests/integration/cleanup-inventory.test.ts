import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  autoArrangeStorage,
  clearByScope,
  clearInventory,
  cleanupCounts,
  closeDb,
  createInventoryItem,
  createStorage,
  deleteCharacterProfile,
  deleteInventoryItem,
  deleteStorage,
  getCharacter,
  getEvent,
  hasInventory,
  inventoryCounts,
  migrate,
  moveInventoryItem,
  openDb,
  resetAll,
  rollbackEvent,
  setContainerFill,
  setWeaponModification,
  updateInventoryItem,
  updateStorage,
  type Db,
} from '@profile/core';
import { effectiveContainerSlots, getStorage, inventoryCleanupSnapshot } from '@profile/core/modules/inventory';
import { getInventoryItem } from '@profile/core/testing';
import { norm } from '@profile/shared';
import {
  InventoryItemCreateSchema,
  InventoryItemPatchSchema,
  MoveItemSchema,
  StorageCreateSchema,
  StoragePatchSchema,
} from '@profile/shared/contracts';
import { seedInventory, type SeedInventory } from '../fixtures/inventory';

let dir: string;
let db: Db;
let seeded: SeedInventory;
let characterId: number;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-cleanup-inventory-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  seeded = seedInventory(db);
  characterId = seeded.characterId;
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

function snapshot() {
  return inventoryCleanupSnapshot(db, characterId);
}

describe('inventory cleanup', () => {
  it('dry-runs without deleting rows or writing an event', () => {
    const before = snapshot();
    const result = clearInventory(db, true);

    expect(result.dryRun).toBe(true);
    expect(result.eventId).toBeUndefined();
    expect(result.diff.before).toEqual(before);
    expect(inventoryCounts(db, characterId)).toEqual({ items: 8, storages: 3, placements: 8 });
  });

  it('clears the new model with one event and restores it exactly', () => {
    const before = snapshot();
    const result = clearInventory(db, false);

    expect(result.eventId).toBeTypeOf('number');
    expect(getEvent(db, result.eventId!)).toMatchObject({ action: 'inventory.clear', entity: 'inventory' });
    expect(inventoryCounts(db, characterId)).toEqual({ items: 0, storages: 2, placements: 0 });

    rollbackEvent(db, result.eventId!, false);
    expect(snapshot()).toEqual(before);
  });

  it('recreates the default inventory storage and keeps hasInventory true', () => {
    expect(hasInventory(db, characterId)).toBe(true);
    clearInventory(db, false);
    expect(hasInventory(db, characterId)).toBe(true);
  });

  it('reports the inventory scope in cleanupCounts', () => {
    expect(cleanupCounts(db)).toMatchObject({
      inventory: { items: 8, storages: 3, placements: 8 },
    });
  });

  it('routes the inventory scope to the new model when one exists', () => {
    const result = clearByScope(db, 'inventory', false);
    expect(getEvent(db, result.eventId!)).toMatchObject({ action: 'inventory.clear' });
  });

  it('refuses an empty new inventory', () => {
    clearInventory(db, false);
    expect(() => clearInventory(db, false)).toThrowError(/Nothing to clear/);
  });
});

describe('character and full reset include the new inventory', () => {
  it('restores the new model after a character delete rollback', () => {
    const before = snapshot();
    const removed = deleteCharacterProfile(db, false);
    expect(getCharacter(db)).toBeNull();

    rollbackEvent(db, removed.eventId!, false);
    expect(getCharacter(db)?.id).toBe(characterId);
    expect(snapshot()).toEqual(before);
  });

  it('restores the new model after a full reset rollback', () => {
    const before = snapshot();
    const reset = resetAll(db, false);

    rollbackEvent(db, reset.eventId!, false);
    expect(snapshot()).toEqual(before);
  });
});

describe('new inventory rollbacks', () => {
  it('undoes an item create and an item update', () => {
    const created = createInventoryItem(
      db,
      InventoryItemCreateSchema.parse({ name: 'Пузырь', kind: 'artifact', dryRun: false }),
    );
    expect(created.eventId).toBeTypeOf('number');
    rollbackEvent(db, created.eventId!, false);
    expect(inventoryCounts(db, characterId).items).toBe(8);

    const updated = updateInventoryItem(
      db,
      seeded.instanceIds.rifle!,
      InventoryItemPatchSchema.parse({ level: 10, dryRun: false }),
    );
    rollbackEvent(db, updated.eventId!, false);
    const rifle = (snapshot().items as { id: number; level: number }[]).find(
      (row) => row.id === seeded.instanceIds.rifle,
    );
    expect(rifle?.level).toBe(15);
  });

  it('restores a deleted container and the artifacts installed in it', () => {
    const removed = deleteInventoryItem(db, seeded.instanceIds.backpack!, { dryRun: false });
    expect(inventoryCounts(db, characterId).items).toBe(7);

    rollbackEvent(db, removed.eventId!, false);

    const restored = (snapshot().containerData as { item_id: number }[]).find(
      (row) => row.item_id === seeded.instanceIds.backpack,
    );
    expect(restored).toBeDefined();
    const placement = (snapshot().placements as { item_id: number; location: string; container_slot: number }[]).find(
      (row) => row.item_id === seeded.instanceIds.artifact1,
    );
    expect(placement).toMatchObject({
      location: 'container',
      container_slot: 0,
    });
  });

  it('undoes a move and a weapon module install', () => {
    const moved = moveInventoryItem(
      db,
      seeded.instanceIds.smg!,
      MoveItemSchema.parse({
        target: { location: 'grid', storageId: seeded.storageIds.inventory, x: 0, y: 0 },
        dryRun: false,
      }).target,
      { dryRun: false },
    );
    rollbackEvent(db, moved.eventId!, false);
    const smg = (snapshot().placements as { item_id: number; location: string; storage_id: number }[]).find(
      (row) => row.item_id === seeded.instanceIds.smg,
    );
    expect(smg).toMatchObject({ location: 'grid', storage_id: seeded.storageIds.overflow });

    const installed = setWeaponModification(db, seeded.instanceIds.rifle!, 'scope', seeded.instanceIds.scope!, {
      dryRun: false,
      allowUnverified: true,
    });
    rollbackEvent(db, installed.eventId!, false);
    const scope = (snapshot().placements as { item_id: number; location: string; storage_id: number }[]).find(
      (row) => row.item_id === seeded.instanceIds.scope,
    );
    expect(scope).toMatchObject({ location: 'grid', storage_id: seeded.storageIds.overflow });
  });

  it('undoes storage create, update and delete', () => {
    const created = createStorage(
      db,
      StorageCreateSchema.parse({ name: 'Stash 2', dryRun: false }),
    );
    expect(created.eventId).toBeTypeOf('number');
    rollbackEvent(db, created.eventId!, false);
    expect(inventoryCounts(db, characterId).storages).toBe(3);

    const renamed = updateStorage(
      db,
      seeded.storageIds.stash,
      StoragePatchSchema.parse({ name: 'Renamed', dryRun: false }),
    );
    rollbackEvent(db, renamed.eventId!, false);
    const stash = (snapshot().storages as { id: number; name: string }[]).find(
      (row) => row.id === seeded.storageIds.stash,
    );
    expect(stash?.name).toBe('Stash');

    moveInventoryItem(
      db,
      seeded.instanceIds.smg!,
      MoveItemSchema.parse({
        target: { location: 'grid', storageId: seeded.storageIds.stash, x: 1, y: 1 },
        dryRun: false,
      }).target,
      { dryRun: false },
    );
    const removed = deleteStorage(db, seeded.storageIds.stash, { dryRun: false });
    rollbackEvent(db, removed.eventId!, false);
    const placement = (snapshot().placements as { item_id: number; location: string; x: number; y: number }[]).find(
      (row) => row.item_id === seeded.instanceIds.smg,
    );
    expect(placement).toMatchObject({ location: 'grid', x: 1, y: 1 });
  });

  it('restores a deleted storage name with the shared normalizer', () => {
    updateStorage(db, seeded.storageIds.stash, StoragePatchSchema.parse({ name: 'Ёлка "склад"', dryRun: false }));
    const removed = deleteStorage(db, seeded.storageIds.stash, { dryRun: false });

    rollbackEvent(db, removed.eventId!, false);

    expect(getStorage(db, seeded.storageIds.stash)?.name).toBe('Ёлка "склад"');
    expect(getStorage(db, seeded.storageIds.stash)?.name_norm).toBe(norm('Ёлка "склад"'));
  });

  it('undoes a container fill and an auto-arrange', () => {    const capacity = effectiveContainerSlots(db, getInventoryItem(db, seeded.instanceIds.backpack!)!)!;
    const filled = setContainerFill(
      db,
      seeded.instanceIds.backpack!,
      [seeded.instanceIds.artifact2!].slice(0, capacity),
      { dryRun: false },
    );
    rollbackEvent(db, filled.eventId!, false);
    const artifact1 = (snapshot().placements as { item_id: number; location: string; container_slot: number }[]).find(
      (row) => row.item_id === seeded.instanceIds.artifact1,
    );
    expect(artifact1).toMatchObject({ location: 'container', container_slot: 0 });

    const arranged = autoArrangeStorage(db, seeded.storageIds.stash, { dryRun: false });
    expect(arranged.eventId).toBeTypeOf('number');
    rollbackEvent(db, arranged.eventId!, false);
    for (const [itemId, y] of [
      [seeded.instanceIds.smg, 0],
      [seeded.instanceIds.artifact2, 4],
      [seeded.instanceIds.scope, 8],
      [seeded.instanceIds.ammo, 12],
    ] as const) {
      const placement = (
        snapshot().placements as { item_id: number; location: string; storage_id: number; x: number; y: number }[]
      ).find((row) => row.item_id === itemId);
      expect(placement).toMatchObject({
        location: 'grid',
        storage_id: seeded.storageIds.overflow,
        x: 0,
        y,
      });
    }
  });
});
