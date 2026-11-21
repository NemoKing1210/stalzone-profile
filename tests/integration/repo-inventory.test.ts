import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, ensureDefaultSources, migrate, openDb, type Db } from '@profile/core';
import * as seed from '@profile/core/testing';
import {
  deleteStorageRow,
  getContainerData,
  getInventoryItem,
  getInventoryStorage,
  getItemLayout,
  getOverflowStorage,
  getPlacement,
  getStorage,
  insertInventoryItem,
  insertStorage,
  listCompatForAttachment,
  listInventoryItems,
  listStorages,
  replaceExboCompat,
  upsertContainerData,
  upsertItemLayout,
  upsertPlacement,
} from '@profile/core/modules/inventory';

let dir: string;
let db: Db;
let characterId: number;
let weaponId: number;
let artifactId: number;
let containerId: number;
let attachmentId: number;

function item(kind: string, name: string, category: string | null = null): number {
  return seed.upsertItem(db, {
    sourceId: 'local',
    externalId: `local:${kind}:${name}`,
    name,
    kind,
    category,
  });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-inventory-repo-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
  characterId = seed.upsertCharacter(db, { nick: 'tester', region: 'ru' });
  weaponId = item('weapon', 'Rifle', 'weapon/assault_rifle');
  artifactId = item('artifact', 'Artifact');
  containerId = item('container', 'Backpack', 'backpacks');
  attachmentId = item('attachment', 'Scope', 'attachment/scope');
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('inventory repository', () => {
  it('creates one inventory storage and rejects a second', () => {
    const id = insertStorage(db, { characterId, kind: 'inventory', name: 'Inventory', width: 8, height: 8 });
    expect(getInventoryStorage(db, characterId)).toMatchObject({ id, kind: 'inventory' });
    expect(() =>
      insertStorage(db, { characterId, kind: 'inventory', name: 'Other', width: 8, height: 8 }),
    ).toThrow(/UNIQUE/);
  });

  it('rejects duplicate stash names after normalization', () => {
    insertStorage(db, { characterId, kind: 'stash', name: 'Мой Склад', width: 8, height: 12 });
    expect(() =>
      insertStorage(db, { characterId, kind: 'stash', name: 'мой склад', width: 8, height: 12 }),
    ).toThrow(/UNIQUE/);
  });

  it('round-trips gear and stackable rows', () => {
    const gearId = insertInventoryItem(db, {
      characterId,
      itemId: weaponId,
      kind: 'weapon',
      level: 15,
      quality: 'Редкий',
      rarityPct: 120,
      rarityTier: 'rare',
      slot: 'primary',
    });
    expect(getInventoryItem(db, gearId)).toMatchObject({
      level: 15,
      quality: 'Редкий',
      rarity_pct: 120,
      rarity_tier: 'rare',
      slot: 'primary',
      qty: 1,
    });
    const ammoId = insertInventoryItem(db, { characterId, itemId: weaponId, kind: 'ammo', qty: 30 });
    expect(getInventoryItem(db, ammoId)?.qty).toBe(30);
    expect(() => insertInventoryItem(db, { characterId, itemId: weaponId, kind: 'weapon', qty: 2 })).toThrow(/CHECK/);
  });

  it('round-trips every placement shape and rejects a mismatched shape', () => {
    const storageId = insertStorage(db, { characterId, kind: 'stash', name: 'Stash', width: 8, height: 12 });
    const bag = insertInventoryItem(db, { characterId, itemId: containerId, kind: 'container' });
    const rifle = insertInventoryItem(db, { characterId, itemId: weaponId, kind: 'weapon' });
    const artifact = insertInventoryItem(db, { characterId, itemId: artifactId, kind: 'artifact' });
    const scope = insertInventoryItem(db, { characterId, itemId: attachmentId, kind: 'attachment' });

    upsertPlacement(db, { itemId: rifle, characterId, location: 'grid', storageId, x: 1, y: 2 });
    expect(getPlacement(db, rifle)).toMatchObject({ location: 'grid', storage_id: storageId, x: 1, y: 2 });

    upsertPlacement(db, { itemId: rifle, characterId, location: 'equipment', equipmentSlot: 'primary' });
    expect(getPlacement(db, rifle)).toMatchObject({ location: 'equipment', equipment_slot: 'primary' });

    upsertPlacement(db, {
      itemId: artifact,
      characterId,
      location: 'container',
      containerItemId: bag,
      containerSlot: 0,
    });
    expect(getPlacement(db, artifact)).toMatchObject({ container_item_id: bag, container_slot: 0 });

    upsertPlacement(db, {
      itemId: scope,
      characterId,
      location: 'weapon_module',
      weaponItemId: rifle,
      moduleSlot: 'scope',
      verified: false,
    });
    expect(getPlacement(db, scope)).toMatchObject({ weapon_item_id: rifle, module_slot: 'scope', verified: 0 });

    upsertPlacement(db, { itemId: bag, characterId, location: 'loose' });
    expect(getPlacement(db, bag)).toMatchObject({ location: 'loose' });

    expect(() =>
      db
        .prepare(
          `INSERT INTO item_placement (item_id, character_id, location, x, y, updated_at)
           VALUES (?, ?, 'grid', 0, 0, 'now')`,
        )
        .run(rifle, characterId),
    ).toThrow(/CHECK/);
  });

  it('rejects a second equipment item and the same grid origin', () => {
    const storageId = insertStorage(db, { characterId, kind: 'stash', name: 'Stash', width: 8, height: 12 });
    const first = insertInventoryItem(db, { characterId, itemId: weaponId, kind: 'weapon' });
    const second = insertInventoryItem(db, { characterId, itemId: weaponId, kind: 'weapon' });
    upsertPlacement(db, { itemId: first, characterId, location: 'equipment', equipmentSlot: 'primary' });
    expect(() =>
      upsertPlacement(db, { itemId: second, characterId, location: 'equipment', equipmentSlot: 'primary' }),
    ).toThrow(/UNIQUE/);

    const third = insertInventoryItem(db, { characterId, itemId: weaponId, kind: 'weapon' });
    upsertPlacement(db, { itemId: first, characterId, location: 'grid', storageId, x: 0, y: 0 });
    expect(() =>
      upsertPlacement(db, { itemId: third, characterId, location: 'grid', storageId, x: 0, y: 0 }),
    ).toThrow(/UNIQUE/);
  });

  it('round-trips container data and item layout', () => {
    const bag = insertInventoryItem(db, { characterId, itemId: containerId, kind: 'container' });
    upsertContainerData(db, bag, { type: 'Backpack', protection: 50, slots: 4, eff: 80 });
    expect(getContainerData(db, bag)).toMatchObject({ type: 'Backpack', protection: 50, slots: 4, eff: 80 });

    upsertItemLayout(db, weaponId, { width: 4, height: 2, weight: 3.5 });
    expect(getItemLayout(db, weaponId)).toMatchObject({ width: 4, height: 2, weight: 3.5 });
  });

  it('replaces only EXBO compatibility and keeps manual edges', () => {
    const weaponTwo = item('weapon', 'Rifle Two', 'weapon/assault_rifle');
    const attachmentTwo = item('attachment', 'Scope Two', 'attachment/scope');
    db.prepare(
      `INSERT INTO attachment_compat (attachment_item_id, weapon_item_id, source, updated_at)
       VALUES (?, ?, 'manual', 'now')`,
    ).run(attachmentTwo, weaponTwo);

    replaceExboCompat(db, [{ attachmentItemId: attachmentId, weaponItemId: weaponId }]);
    expect(listCompatForAttachment(db, attachmentId)).toMatchObject([
      { attachment_item_id: attachmentId, weapon_item_id: weaponId, source: 'exbo' },
    ]);
    expect(listCompatForAttachment(db, attachmentTwo)).toMatchObject([{ source: 'manual' }]);

    replaceExboCompat(db, []);
    expect(listCompatForAttachment(db, attachmentId)).toEqual([]);
    expect(listCompatForAttachment(db, attachmentTwo)).toMatchObject([{ source: 'manual' }]);
  });

  it('cascades grid placements when a storage is deleted but keeps the items', () => {
    const storageId = insertStorage(db, { characterId, kind: 'stash', name: 'Stash', width: 8, height: 12 });
    const rifle = insertInventoryItem(db, { characterId, itemId: weaponId, kind: 'weapon' });
    upsertPlacement(db, { itemId: rifle, characterId, location: 'grid', storageId, x: 0, y: 0 });
    deleteStorageRow(db, storageId);
    expect(getPlacement(db, rifle)).toBeNull();
    expect(getInventoryItem(db, rifle)).not.toBeNull();
    expect(getStorage(db, storageId)).toBeNull();
    expect(listStorages(db, characterId)).toEqual([]);
  });

  it('filters items by kind, location and storage', () => {
    const storageId = insertStorage(db, { characterId, kind: 'stash', name: 'Stash', width: 8, height: 12 });
    const rifle = insertInventoryItem(db, { characterId, itemId: weaponId, kind: 'weapon' });
    const artifact = insertInventoryItem(db, { characterId, itemId: artifactId, kind: 'artifact' });
    upsertPlacement(db, { itemId: rifle, characterId, location: 'grid', storageId, x: 0, y: 0 });
    upsertPlacement(db, { itemId: artifact, characterId, location: 'loose' });

    expect(listInventoryItems(db, characterId, { kind: 'weapon' }).map((row) => row.id)).toEqual([rifle]);
    expect(listInventoryItems(db, characterId, { location: 'grid' }).map((row) => row.id)).toEqual([rifle]);
    expect(listInventoryItems(db, characterId, { storageId }).map((row) => row.id)).toEqual([rifle]);
  });

  it('reads the intake storage and orders inventory, intake, then stashes', () => {
    const other = seed.upsertCharacter(db, { nick: 'intake-repo', region: 'ru' });
    const inventory = insertStorage(db, { characterId: other, kind: 'inventory', name: 'Inventory', width: 8, height: 20 });
    const overflow = insertStorage(db, { characterId: other, kind: 'overflow', name: 'Intake', width: 40, height: 80 });
    const stash = insertStorage(db, { characterId: other, kind: 'stash', name: 'Main', width: 40, height: 80 });
    expect(getOverflowStorage(db, other)?.id).toBe(overflow);
    expect(listStorages(db, other).map((row) => row.id)).toEqual([inventory, overflow, stash]);
  });
});
