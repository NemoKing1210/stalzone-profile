import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, ensureDefaultSources, migrate, openDb, rollbackEvent, WriteError, type Db } from '@profile/core';
import { InventoryItemCreateSchema } from '@profile/shared/contracts';
import {
  autoArrangeStorage,
  createInventoryItem,
  deleteInventoryItem,
  deleteStorage,
  ensureInventoryStorage,
  ensureOverflowStorage,
  getOverflowStorage,
  getPlacement,
  getStorage,
  inventoryRead,
  listStorages,
  moveInventoryItem,
  setContainerFill,
  setItemLayout,
  setWeaponModule,
  updateStorage,
  upsertContainerData,
  upsertPlacement,
} from '@profile/core/modules/inventory';
import * as seed from '@profile/core/testing';

let dir: string;
let db: Db;
let characterId: number;
let inventoryId: number;
let overflowId: number;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-inventory-overflow-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
  characterId = seed.upsertCharacter(db, { nick: 'intake', region: 'ru' });
  inventoryId = ensureInventoryStorage(db, characterId);
  overflowId = ensureOverflowStorage(db, characterId);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

function catalog(key: string, name: string, kind = 'other', category: string | null = null, weight = 1): number {
  return seed.upsertItem(db, {
    sourceId: 'local',
    externalId: `intake:${key}`,
    name,
    kind,
    category,
    weight,
  });
}

function add(name: string, kind = 'other', qty = 1): number {
  const result = createInventoryItem(db, InventoryItemCreateSchema.parse({ name, kind, qty, dryRun: false }));
  return (result.diff.after as { id: number }).id;
}

describe('intake storage', () => {
  it('creates one intake per character', () => {
    expect(ensureOverflowStorage(db, characterId)).toBe(overflowId);
    expect(getOverflowStorage(db, characterId)).toMatchObject({ kind: 'overflow', width: 8, height: 80 });
    expect(listStorages(db, characterId).map((row) => row.kind)).toEqual(['inventory', 'overflow']);
  });

  it('places a new item in intake', () => {
    catalog('box', 'Ящик');
    const id = add('Ящик');
    expect(getPlacement(db, id)).toMatchObject({ location: 'grid', storage_id: overflowId, x: 0, y: 0, rotated: 0 });
  });

  it('merges a stackable add with an existing intake stack', () => {
    catalog('ammo', 'Патроны', 'ammo', 'bullet', 0.01);
    const first = add('Патроны', 'ammo', 10);
    const second = add('Патроны', 'ammo', 5);
    expect(second).toBe(first);
    expect(inventoryRead(db, characterId).storages.find((row) => row.id === overflowId)?.items[0]?.qty).toBe(15);
  });

  it('packs two wide items inside the eight intake columns', () => {
    const first = catalog('wide-a', 'Широкий A');
    const second = catalog('wide-b', 'Широкий B');
    setItemLayout(db, first, { width: 6, height: 2 }, { dryRun: false });
    setItemLayout(db, second, { width: 6, height: 2 }, { dryRun: false });

    const a = add('Широкий A');
    const b = add('Широкий B');

    const items = inventoryRead(db, characterId).storages.find((row) => row.id === overflowId)!.items;
    for (const id of [a, b]) {
      const item = items.find((entry) => entry.id === id)!;
      const placement = item.placement;
      expect(placement.location).toBe('grid');
      if (placement.location !== 'grid') continue;
      const width = placement.rotated ? item.size.height : item.size.width;
      expect(placement.x).toBeGreaterThanOrEqual(0);
      expect(placement.x + width).toBeLessThanOrEqual(8);
    }
  });

  it('expands the intake read height past 80 rows', () => {
    const itemId = catalog('tall', 'Высокий');
    const id = seed.insertInventoryItem(db, { characterId, itemId, kind: 'other' });
    upsertPlacement(db, { itemId: id, characterId, location: 'grid', storageId: overflowId, x: 0, y: 80 });
    expect(inventoryRead(db, characterId).storages.find((row) => row.id === overflowId)?.height).toBe(81);
  });

  it('expands the intake read height for a rotated item', () => {
    const itemId = catalog('wide', 'Широкий');
    setItemLayout(db, itemId, { width: 5, height: 2 }, { dryRun: false });
    const id = seed.insertInventoryItem(db, { characterId, itemId, kind: 'other' });
    upsertPlacement(db, {
      itemId: id,
      characterId,
      location: 'grid',
      storageId: overflowId,
      x: 0,
      y: 78,
      rotated: true,
    });
    expect(inventoryRead(db, characterId).storages.find((row) => row.id === overflowId)?.height).toBe(83);
  });

  it('does not count intake items as carried', () => {
    catalog('rifle', 'Винтовка', 'weapon', 'weapon/assault_rifle', 4);
    add('Винтовка', 'weapon');
    const read = inventoryRead(db, characterId);
    expect(read.stats.carry.carried.value).toBeCloseTo(0, 5);
    expect(read.stats.storages[String(overflowId)]?.value).toBeCloseTo(4, 5);
  });
});

function expectWriteError(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.fail(`expected WriteError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(WriteError);
    expect((error as WriteError).code).toBe(code);
  }
}

function stash(name = 'Main'): number {
  return seed.insertStorage(db, { characterId, kind: 'stash', name, width: 40, height: 80, sortOrder: 0 });
}

describe('removals go to intake', () => {
  it('moves a deleted stash contents to intake and rolls back exactly', () => {
    catalog('box', 'Ящик', 'container', 'containers');
    catalog('rifle2', 'Карабин', 'weapon', 'weapon/assault_rifle', 4);
    catalog('art', 'Артефакт', 'artifact', 'artefact', 0.1);
    catalog('scope2', 'Прицел', 'attachment', 'attachment/scope', 0.4);

    const stashId = stash();
    const containerId = add('Ящик', 'container');
    const rifleId = add('Карабин', 'weapon');
    const artifactId = add('Артефакт', 'artifact');
    const attachmentId = add('Прицел', 'attachment');
    upsertPlacement(db, { itemId: containerId, characterId, location: 'grid', storageId: stashId, x: 0, y: 0 });
    upsertPlacement(db, { itemId: rifleId, characterId, location: 'grid', storageId: stashId, x: 5, y: 0 });
    upsertContainerData(db, containerId, { slots: 2, eff: 100 });
    upsertPlacement(db, {
      itemId: artifactId,
      characterId,
      location: 'container',
      containerItemId: containerId,
      containerSlot: 0,
    });
    setWeaponModule(db, rifleId, 'scope', attachmentId, { allowUnverified: true, dryRun: false });

    const result = deleteStorage(db, stashId, { dryRun: false });
    expect(result.diff.after).toEqual({
      deleted: true,
      movedTo: overflowId,
      moved: [containerId, rifleId],
    });
    expect(getStorage(db, stashId)).toBeNull();
    for (const itemId of [containerId, rifleId]) {
      expect(getPlacement(db, itemId)).toMatchObject({ location: 'grid', storage_id: overflowId });
    }
    expect(getPlacement(db, artifactId)).toMatchObject({
      location: 'container',
      container_item_id: containerId,
    });
    expect(getPlacement(db, attachmentId)).toMatchObject({
      location: 'weapon_module',
      weapon_item_id: rifleId,
    });

    rollbackEvent(db, result.eventId!, false);
    expect(getStorage(db, stashId)).not.toBeNull();
    expect(getPlacement(db, containerId)).toMatchObject({
      location: 'grid',
      storage_id: stashId,
      x: 0,
      y: 0,
    });
    expect(getPlacement(db, rifleId)).toMatchObject({
      location: 'grid',
      storage_id: stashId,
      x: 5,
      y: 0,
    });
  });

  it('moves removed container artifacts to intake', () => {
    catalog('box', 'Ящик', 'container', 'containers');
    catalog('art', 'Артефакт', 'artifact', 'artefact', 0.1);
    const containerId = add('Ящик', 'container');
    const artifactId = add('Артефакт', 'artifact');
    upsertContainerData(db, containerId, { slots: 2, eff: 100 });
    upsertPlacement(db, {
      itemId: artifactId,
      characterId,
      location: 'container',
      containerItemId: containerId,
      containerSlot: 0,
    });

    const result = deleteInventoryItem(db, containerId, { dryRun: false });
    expect(result.diff.after).toEqual({ deleted: true, movedToOverflow: [artifactId] });
    expect(getPlacement(db, artifactId)).toMatchObject({ location: 'grid', storage_id: overflowId });
  });

  it('moves a removed weapon module to intake', () => {
    catalog('rifle', 'Винтовка', 'weapon', 'weapon/assault_rifle', 4);
    catalog('scope', 'Прицел', 'attachment', 'attachment/scope', 0.4);
    const rifleId = add('Винтовка', 'weapon');
    const attachmentId = add('Прицел', 'attachment');
    setWeaponModule(db, rifleId, 'scope', attachmentId, { allowUnverified: true, dryRun: false });

    setWeaponModule(db, rifleId, 'scope', null, { dryRun: false });
    expect(getPlacement(db, attachmentId)).toMatchObject({ location: 'grid', storage_id: overflowId });
  });

  it('moves artifacts displaced by a container fill to intake', () => {
    catalog('box', 'Ящик', 'container', 'containers');
    catalog('art1', 'Артефакт', 'artifact', 'artefact', 0.1);
    catalog('art2', 'Пузырь', 'artifact', 'artefact', 0.1);
    const containerId = add('Ящик', 'container');
    const first = add('Артефакт', 'artifact');
    const second = add('Пузырь', 'artifact');
    upsertContainerData(db, containerId, { slots: 2, eff: 100 });

    setContainerFill(db, containerId, [first], { dryRun: false });
    const result = setContainerFill(db, containerId, [second], { dryRun: false });
    expect(result.diff.after).toMatchObject({ movedToOverflow: [first] });
    expect(getPlacement(db, first)).toMatchObject({ location: 'grid', storage_id: overflowId });
    expect(getPlacement(db, second)).toMatchObject({
      location: 'container',
      container_item_id: containerId,
    });
  });

  it('rejects an explicit move into intake', () => {
    catalog('box', 'Ящик');
    const id = add('Ящик');
    expectWriteError(
      () =>
        moveInventoryItem(
          db,
          id,
          { location: 'grid', storageId: overflowId, x: 1, y: 0, rotated: false },
          { dryRun: false },
        ),
      'INVALID_PLACEMENT',
    );
  });

  it('rejects a swap that would push the occupant into intake', () => {
    catalog('rifle', 'Винтовка', 'weapon', 'weapon/assault_rifle', 4);
    const rifleInstance = add('Винтовка', 'weapon');
    moveInventoryItem(db, rifleInstance, { location: 'equipment', slot: 'primary' }, { dryRun: false });
    catalog('box', 'Ящик');
    const box = add('Ящик');
    expectWriteError(
      () =>
        moveInventoryItem(db, box, { location: 'equipment', slot: 'primary' }, { swap: true, dryRun: false }),
      'INVALID_PLACEMENT',
    );
  });

  it('rejects edits and deletes of the mandatory storages', () => {
    expectWriteError(() => updateStorage(db, inventoryId, { name: 'X', dryRun: false }), 'VALIDATION');
    expectWriteError(() => updateStorage(db, overflowId, { name: 'X', dryRun: false }), 'VALIDATION');
    expectWriteError(() => deleteStorage(db, inventoryId, { dryRun: false }), 'VALIDATION');
    expectWriteError(() => deleteStorage(db, overflowId, { dryRun: false }), 'VALIDATION');
  });

  it('rejects a catalog layout change while an instance is in intake', () => {
    const itemId = catalog('box', 'Ящик');
    add('Ящик');
    try {
      setItemLayout(db, itemId, { width: 2, height: 2 }, { dryRun: false });
      expect.fail('expected LAYOUT_CONFLICT');
    } catch (error) {
      expect(error).toBeInstanceOf(WriteError);
      expect((error as WriteError).code).toBe('LAYOUT_CONFLICT');
      expect((error as WriteError).details).toMatchObject({ reason: 'intake' });
    }
  });

  it('rejects auto-arrange into the inventory', () => {
    expect(() => autoArrangeStorage(db, inventoryId, { dryRun: true })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    );
  });

  it('packs intake items into a stash and restores their exact spots on rollback', () => {
    catalog('box', 'Ящик');
    catalog('art', 'Артефакт', 'artifact', 'artefact', 0.1);
    const first = add('Ящик');
    const second = add('Артефакт', 'artifact');
    upsertPlacement(db, { itemId: first, characterId, location: 'grid', storageId: overflowId, x: 0, y: 0 });
    upsertPlacement(db, { itemId: second, characterId, location: 'grid', storageId: overflowId, x: 0, y: 1 });
    const stashId = stash();

    const result = autoArrangeStorage(db, stashId, { dryRun: false });
    expect(result.diff.after).toMatchObject({ storageId: stashId });
    for (const itemId of [first, second]) {
      expect(getPlacement(db, itemId)).toMatchObject({ location: 'grid', storage_id: stashId });
    }

    rollbackEvent(db, result.eventId!, false);
    expect(getPlacement(db, first)).toMatchObject({ location: 'grid', storage_id: overflowId, x: 0, y: 0 });
    expect(getPlacement(db, second)).toMatchObject({ location: 'grid', storage_id: overflowId, x: 0, y: 1 });
  });
});
