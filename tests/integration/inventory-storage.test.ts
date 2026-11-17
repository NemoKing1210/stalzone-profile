import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  ensureDefaultSources,
  eventCount,
  getEvent,
  listEvents,
  migrate,
  openDb,
  WriteError,
  type Db,
} from '@profile/core';
import {
  InventoryItemCreateSchema,
  StorageCreateSchema,
  StoragePatchSchema,
} from '@profile/shared/contracts';
import {
  createInventoryItem,
  createStorage,
  deleteInventoryItem,
  deleteStorage,
  ensureInventoryStorage,
  getContainerData,
  getInventoryItem,
  getPlacement,
  getStorage,
  inventorySnapshot,
  listInventoryItems,
  updateInventoryItem,
  updateStorage,
  upsertContainerData,
  upsertPlacement,
} from '@profile/core/modules/inventory';
import * as seed from '@profile/core/testing';

let dir: string;
let db: Db;
let characterId: number;
let weaponId: number;
let ammoId: number;
let containerId: number;
let artifactId: number;

function item(kind: string, name: string, category: string | null, weight: number | null): number {
  return seed.upsertItem(db, {
    sourceId: 'local',
    externalId: `storage-test:${kind}:${name}`,
    name,
    kind,
    category,
    weight,
  });
}

function idOf(result: { diff: { after: unknown } }): number {
  return (result.diff.after as { id: number }).id;
}

function expectWriteError(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.fail(`expected WriteError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(WriteError);
    expect((error as WriteError).code).toBe(code);
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-inventory-write-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
  characterId = seed.upsertCharacter(db, { nick: 'tester', region: 'ru' });
  weaponId = item('weapon', 'АК-12', 'weapon/assault_rifle', 3.8);
  ammoId = item('ammo', 'Патроны', 'bullet', 0.01);
  containerId = item('container', 'Рюкзак', 'containers', 1.2);
  artifactId = item('artifact', 'Артефакт', 'artefact', 0.1);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('inventory storage and item writes', () => {
  it('creates one inventory storage per character', () => {
    const first = ensureInventoryStorage(db, characterId);
    const second = ensureInventoryStorage(db, characterId);
    expect(second).toBe(first);
    expect(listInventoryItems(db, characterId)).toEqual([]);
    expect(getStorage(db, first)?.kind).toBe('inventory');
  });

  it('refuses to move deleted storage contents into another character storage', () => {
    const stash = seed.insertStorage(db, { characterId, kind: 'stash', name: 'Main', width: 6, height: 6 });
    const otherCharacter = seed.upsertCharacter(db, { nick: 'other', region: 'eu' });
    const foreign = seed.insertStorage(db, {
      characterId: otherCharacter,
      kind: 'stash',
      name: 'Foreign',
      width: 6,
      height: 6,
    });

    expectWriteError(() => deleteStorage(db, stash, { moveToStorageId: foreign, dryRun: false }), 'VALIDATION');
    expect(getStorage(db, stash)).not.toBeNull();
  });

  it('creates and renames a stash, rejecting a duplicate normalized name', () => {    const created = createStorage(
      db,
      StorageCreateSchema.parse({ name: 'Мой Склад', width: 8, height: 12, dryRun: false }),
    );
    const stashId = idOf(created);
    expect(created.eventId).toBeDefined();
    expect(getStorage(db, stashId)?.name).toBe('Мой Склад');

    updateStorage(db, stashId, StoragePatchSchema.parse({ name: 'Новый Склад', dryRun: false }));
    expect(getStorage(db, stashId)?.name).toBe('Новый Склад');

    expectWriteError(
      () => createStorage(db, StorageCreateSchema.parse({ name: 'новый склад', width: 8, height: 12, dryRun: false })),
      'STORAGE_NAME_TAKEN',
    );
  });

  it('moves a deleted stash contents to loose and lists them', () => {
    const stashId = idOf(createStorage(db, StorageCreateSchema.parse({ name: 'Stash', width: 8, height: 12, dryRun: false })));
    const rifleId = idOf(createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon', dryRun: false })));
    upsertPlacement(db, { itemId: rifleId, characterId, location: 'grid', storageId: stashId, x: 0, y: 0 });

    const result = deleteStorage(db, stashId, { dryRun: false });
    expect(result.diff.after).toMatchObject({ deleted: true, movedToLoose: [rifleId] });
    expect(getStorage(db, stashId)).toBeNull();
    expect(getInventoryItem(db, rifleId)).not.toBeNull();
    expect(getPlacement(db, rifleId)).toMatchObject({ location: 'loose' });
    expect(listEvents(db)[0]?.action).toBe('inventory.storage.delete');
  });

  it('rejects a storage shrink that would leave an item out of bounds', () => {
    const stashId = idOf(createStorage(db, StorageCreateSchema.parse({ name: 'Wide', width: 6, height: 6, dryRun: false })));
    const rifleId = idOf(createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon', dryRun: false })));
    upsertPlacement(db, { itemId: rifleId, characterId, location: 'grid', storageId: stashId, x: 0, y: 0 });

    expectWriteError(
      () => updateStorage(db, stashId, StoragePatchSchema.parse({ width: 4, dryRun: false })),
      'STORAGE_TOO_SMALL',
    );
    expect(getStorage(db, stashId)?.width).toBe(6);
  });

  it('creates two rows for two identical gear instances', () => {
    createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon', dryRun: false }));
    createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon', dryRun: false }));
    expect(listInventoryItems(db, characterId, { kind: 'weapon' })).toHaveLength(2);
  });

  it('merges a stackable only with a stack at the same location', () => {
    const first = createInventoryItem(
      db,
      InventoryItemCreateSchema.parse({ name: 'Патроны', kind: 'ammo', qty: 10, dryRun: false }),
    );
    const firstId = idOf(first);
    createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Патроны', kind: 'ammo', qty: 5, dryRun: false }));
    let stacks = listInventoryItems(db, characterId, { kind: 'ammo' });
    expect(stacks).toHaveLength(1);
    expect(getInventoryItem(db, firstId)?.qty).toBe(15);

    const stashId = idOf(createStorage(db, StorageCreateSchema.parse({ name: 'Stash', width: 8, height: 12, dryRun: false })));
    upsertPlacement(db, { itemId: firstId, characterId, location: 'grid', storageId: stashId, x: 0, y: 0 });
    createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Патроны', kind: 'ammo', qty: 7, dryRun: false }));
    stacks = listInventoryItems(db, characterId, { kind: 'ammo' });
    expect(stacks).toHaveLength(2);
  });

  it('does not change rows or write events on a dry run', () => {
    const rowsBefore = listInventoryItems(db, characterId).length;
    const eventsBefore = eventCount(db);
    const result = createInventoryItem(
      db,
      InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon', dryRun: true }),
    );
    expect(result.dryRun).toBe(true);
    expect(listInventoryItems(db, characterId).length).toBe(rowsBefore);
    expect(eventCount(db)).toBe(eventsBefore);
  });

  it('writes one event with a before and after snapshot on a real create', () => {
    const result = createInventoryItem(
      db,
      InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon', level: 15, dryRun: false }),
    );
    expect(result.eventId).toBeDefined();
    const event = getEvent(db, result.eventId!);
    expect(event?.action).toBe('inventory.item.create');
    expect(event?.before).toBeNull();
    expect(JSON.parse(event!.after!)).toMatchObject({ name: 'АК-12', level: 15, qty: 1, kind: 'weapon' });
  });

  it('rejects a rarity outside the contract range before the service', () => {
    expect(InventoryItemCreateSchema.safeParse({ name: 'X', kind: 'artifact', rarityPct: 176 }).success).toBe(false);
  });

  it('removes one quantity from a stack and removes the row with the last one', () => {
    const stackId = idOf(
      createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Патроны', kind: 'ammo', qty: 3, dryRun: false })),
    );
    deleteInventoryItem(db, stackId, { qty: 1, dryRun: false });
    expect(getInventoryItem(db, stackId)?.qty).toBe(2);
    deleteInventoryItem(db, stackId, { qty: 5, dryRun: false });
    expect(getInventoryItem(db, stackId)).toBeNull();
  });

  it('returns a deleted container children to loose', () => {
    const bagId = idOf(createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Рюкзак', kind: 'container', dryRun: false })));
    const artifactInstanceId = idOf(
      createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Артефакт', kind: 'artifact', rarityPct: 100, dryRun: false })),
    );
    upsertContainerData(db, bagId, { slots: 2, eff: 100 });
    upsertPlacement(db, {
      itemId: artifactInstanceId,
      characterId,
      location: 'container',
      containerItemId: bagId,
      containerSlot: 0,
    });

    const result = deleteInventoryItem(db, bagId, { dryRun: false });
    expect(result.diff.after).toMatchObject({ deleted: true, movedToLoose: [artifactInstanceId] });
    expect(getPlacement(db, artifactInstanceId)).toMatchObject({ location: 'loose' });
    expect(getInventoryItem(db, artifactInstanceId)).not.toBeNull();
  });

  it('rejects lowering container slots over an installed artifact', () => {
    const bagId = idOf(createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Рюкзак', kind: 'container', dryRun: false })));
    const artifactInstanceId = idOf(
      createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Артефакт', kind: 'artifact', rarityPct: 100, dryRun: false })),
    );
    upsertContainerData(db, bagId, { slots: 2, eff: 100 });
    upsertPlacement(db, {
      itemId: artifactInstanceId,
      characterId,
      location: 'container',
      containerItemId: bagId,
      containerSlot: 1,
    });

    expectWriteError(
      () => updateInventoryItem(db, bagId, { container: { slots: 1 }, dryRun: false }),
      'CONTAINER_SLOTS_IN_USE',
    );
    expect(getContainerData(db, bagId)?.slots).toBe(2);
  });

  it('snapshots storages, items, placements, container data and layouts', () => {
    const stashId = idOf(createStorage(db, StorageCreateSchema.parse({ name: 'Stash', width: 8, height: 12, dryRun: false })));
    const bagId = idOf(createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Рюкзак', kind: 'container', dryRun: false })));
    const rifleId = idOf(createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon', dryRun: false })));
    upsertPlacement(db, { itemId: rifleId, characterId, location: 'grid', storageId: stashId, x: 0, y: 0 });
    upsertContainerData(db, bagId, { slots: 2, eff: 100 });
    seed.upsertItemLayout(db, weaponId, { width: 4, height: 2, weight: 3.5 });

    const snapshot = inventorySnapshot(db, characterId);
    expect(snapshot.storages).toHaveLength(1);
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.placements).toHaveLength(2);
    expect(snapshot.containerData).toMatchObject([{ item_id: bagId, slots: 2 }]);
    expect(snapshot.layouts).toMatchObject([{ item_id: weaponId, width: 4 }]);
  });
});
