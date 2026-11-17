import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  ensureDefaultSources,
  eventCount,
  getEvent,
  migrate,
  openDb,
  rollbackEvent,
  WriteError,
  type Db,
} from '@profile/core';
import { InventoryItemCreateSchema, StorageCreateSchema, type PlacementTarget } from '@profile/shared/contracts';
import {
  autoArrangeStorage,
  createInventoryItem,
  createStorage,
  deleteInventoryItem,
  ensureInventoryStorage,
  getContainerData,
  getInventoryItem,
  getItemLayout,
  getPlacement,
  getStorage,
  listStoragePlacements,
  moveInventoryItem,
  replaceExboCompat,
  setContainerFill,
  setItemLayout,
  setWeaponModule,
  updateInventoryItem,
  upsertContainerData,
} from '@profile/core/modules/inventory';
import * as seed from '@profile/core/testing';

let dir: string;
let db: Db;
let characterId: number;
let inventoryId: number;
let stashId: number;
let weaponId: number;
let weapon2Id: number;
let armorId: number;
let backpackId: number;
let artbagId: number;
let artifactId: number;
let scopeId: number;
let mufflerId: number;

function item(
  kind: string,
  name: string,
  category: string | null,
  weight: number | null,
  external: string,
): number {
  return seed.upsertItem(db, {
    sourceId: 'local',
    externalId: `move-test:${external}`,
    name,
    kind,
    category,
    weight,
  });
}

function make(kind: string, name: string, qty = 1): number {
  const result = createInventoryItem(
    db,
    InventoryItemCreateSchema.parse({ name, kind, qty, dryRun: false }),
  );
  return (result.diff.after as { id: number }).id;
}

function makeContainer(name: string, slots: number): number {
  const id = make('container', name);
  upsertContainerData(db, id, { slots, eff: 100 });
  return id;
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

function grid(storageId: number, x: number, y: number, rotated = false): PlacementTarget {
  return { location: 'grid', storageId, x, y, rotated };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-inventory-move-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
  characterId = seed.upsertCharacter(db, { nick: 'tester', region: 'ru' });
  inventoryId = ensureInventoryStorage(db, characterId);
  stashId = (
    createStorage(db, StorageCreateSchema.parse({ name: 'Stash', width: 8, height: 12, dryRun: false })).diff
      .after as { id: number }
  ).id;

  weaponId = item('weapon', 'АК-12', 'weapon/assault_rifle', 3.8, 'rifle');
  weapon2Id = item('weapon', 'АК-74', 'weapon/assault_rifle', 3.6, 'rifle2');
  armorId = item('armor', 'Броня', 'armor/combat', 8, 'armor');
  backpackId = item('container', 'Рюкзак', 'containers/backpacks', 1.2, 'backpack');
  artbagId = item('container', 'Контейнер', 'containers', 0.8, 'artbag');
  artifactId = item('artifact', 'Нервяк', 'artefact/gravity', 0.1, 'artifact');
  scopeId = item('attachment', 'Прицел', 'attachment/scope', 0.4, 'scope');
  mufflerId = item('attachment', 'Глушитель', 'attachment/muzzle', 0.5, 'muffler');
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('inventory placement writes', () => {
  it('moves an item to a valid grid cell', () => {
    const rifle = make('weapon', 'АК-12');
    const result = moveInventoryItem(db, rifle, grid(stashId, 1, 2), { dryRun: false });
    expect(result.eventId).toBeDefined();
    expect(getPlacement(db, rifle)).toMatchObject({
      location: 'grid',
      storage_id: stashId,
      x: 1,
      y: 2,
      rotated: 0,
    });
    expect(listStoragePlacements(db, stashId)).toHaveLength(1);
    expect(getEvent(db, result.eventId!)?.action).toBe('inventory.item.move');
  });

  it('rejects a grid collision without changing rows or events', () => {
    const first = make('weapon', 'АК-12');
    const second = make('weapon', 'АК-74');
    moveInventoryItem(db, first, grid(stashId, 0, 0), { dryRun: false });
    const events = eventCount(db);

    expectWriteError(() => moveInventoryItem(db, second, grid(stashId, 0, 0), { dryRun: false }), 'SLOT_OCCUPIED');
    expect(getPlacement(db, second)).toMatchObject({ location: 'loose' });
    expect(eventCount(db)).toBe(events);
  });

  it('rejects a grid target outside the storage bounds', () => {
    const rifle = make('weapon', 'АК-12');
    expectWriteError(() => moveInventoryItem(db, rifle, grid(stashId, 4, 0), { dryRun: false }), 'OUT_OF_BOUNDS');
    expect(getPlacement(db, rifle)).toMatchObject({ location: 'loose' });
  });

  it('applies rotation before checking bounds and collisions', () => {
    const first = make('weapon', 'АК-12');
    const second = make('weapon', 'АК-74');

    moveInventoryItem(db, first, grid(inventoryId, 3, 0, true), { dryRun: false });
    expect(getPlacement(db, first)).toMatchObject({ x: 3, y: 0, rotated: 1 });

    expectWriteError(
      () => moveInventoryItem(db, second, grid(inventoryId, 3, 0, true), { dryRun: false }),
      'SLOT_OCCUPIED',
    );
  });

  it('equips a weapon and swaps it with the current occupant', () => {
    const first = make('weapon', 'АК-12');
    const second = make('weapon', 'АК-74');

    moveInventoryItem(db, first, { location: 'equipment', slot: 'primary' }, { dryRun: false });
    expect(getPlacement(db, first)).toMatchObject({ location: 'equipment', equipment_slot: 'primary' });

    moveInventoryItem(
      db,
      second,
      { location: 'equipment', slot: 'primary' },
      { swap: true, dryRun: false },
    );
    expect(getPlacement(db, second)).toMatchObject({ location: 'equipment', equipment_slot: 'primary' });
    expect(getPlacement(db, first)).toMatchObject({ location: 'loose' });
  });

  it('equips armor and rejects a kind the slot does not accept', () => {
    const armor = make('armor', 'Броня');
    const rifle = make('weapon', 'АК-12');

    moveInventoryItem(db, armor, { location: 'equipment', slot: 'armor' }, { dryRun: false });
    expect(getPlacement(db, armor)).toMatchObject({ location: 'equipment', equipment_slot: 'armor' });

    expectWriteError(
      () => moveInventoryItem(db, rifle, { location: 'equipment', slot: 'armor' }, { dryRun: false }),
      'INVALID_PLACEMENT',
    );
    expect(getPlacement(db, rifle)).toMatchObject({ location: 'loose' });
  });

  it('installs an artifact into a container slot and validates kind and capacity', () => {
    const bag = makeContainer('Контейнер', 2);
    const artifact = make('artifact', 'Нервяк');
    const scope = make('attachment', 'Прицел');
    const other = make('artifact', 'Нервяк');

    moveInventoryItem(
      db,
      artifact,
      { location: 'container', containerItemId: bag, slot: 0 },
      { dryRun: false },
    );
    expect(getPlacement(db, artifact)).toMatchObject({
      location: 'container',
      container_item_id: bag,
      container_slot: 0,
    });

    expectWriteError(
      () => moveInventoryItem(db, scope, { location: 'container', containerItemId: bag, slot: 1 }, { dryRun: false }),
      'NOT_AN_ARTIFACT',
    );
    expectWriteError(
      () => moveInventoryItem(db, other, { location: 'container', containerItemId: bag, slot: 2 }, { dryRun: false }),
      'CONTAINER_FULL',
    );
  });

  it('replaces a container fill and returns omitted artifacts to loose', () => {
    const bag = makeContainer('Контейнер', 3);
    const a = make('artifact', 'Нервяк');
    const b = make('artifact', 'Нервяк');
    const c = make('artifact', 'Нервяк');

    const first = setContainerFill(db, bag, [a, b, c], { dryRun: false });
    expect(first.eventId).toBeDefined();
    expect(getPlacement(db, a)).toMatchObject({ container_item_id: bag, container_slot: 0 });
    expect(getPlacement(db, c)).toMatchObject({ container_item_id: bag, container_slot: 2 });

    const result = setContainerFill(db, bag, [a, null, b], { dryRun: false });
    expect(result.diff.after).toMatchObject({ containerItemId: bag, movedToLoose: [c] });
    expect(getPlacement(db, a)).toMatchObject({ container_slot: 0 });
    expect(getPlacement(db, b)).toMatchObject({ container_slot: 2 });
    expect(getPlacement(db, c)).toMatchObject({ location: 'loose' });
    expect(getEvent(db, result.eventId!)?.action).toBe('inventory.container.fill');

    const scope = make('attachment', 'Прицел');
    expectWriteError(() => setContainerFill(db, bag, [scope], { dryRun: false }), 'NOT_AN_ARTIFACT');
    expectWriteError(() => setContainerFill(db, bag, [a, b, c, a], { dryRun: false }), 'CONTAINER_FULL');
  });

  it('rejects lowering container slots over an installed artifact', () => {
    const bag = makeContainer('Контейнер', 3);
    const a = make('artifact', 'Нервяк');
    const b = make('artifact', 'Нервяк');
    setContainerFill(db, bag, [a, b], { dryRun: false });

    expectWriteError(
      () => updateInventoryItem(db, bag, { container: { slots: 1 }, dryRun: false }),
      'CONTAINER_SLOTS_IN_USE',
    );
    expect(getContainerData(db, bag)?.slots).toBe(3);
  });

  it('installs a compatible module, rejects incompatible pairs and allows an explicit unverified install', () => {
    const rifle = make('weapon', 'АК-12');
    const otherRifle = make('weapon', 'АК-74');
    const scope = make('attachment', 'Прицел');
    const muffler = make('attachment', 'Глушитель');
    replaceExboCompat(db, [{ attachmentItemId: scopeId, weaponItemId: weaponId }]);

    const installed = setWeaponModule(db, rifle, 'scope', scope, { dryRun: false });
    expect(installed.eventId).toBeDefined();
    expect(getPlacement(db, scope)).toMatchObject({
      location: 'weapon_module',
      weapon_item_id: rifle,
      module_slot: 'scope',
      verified: 1,
    });

    expectWriteError(
      () =>
        setWeaponModule(db, otherRifle, 'scope', scope, {
          allowUnverified: true,
          dryRun: false,
        }),
      'INCOMPATIBLE_ATTACHMENT',
    );

    expectWriteError(
      () => setWeaponModule(db, rifle, 'muzzle', muffler, { dryRun: false }),
      'INCOMPATIBLE_ATTACHMENT',
    );
    setWeaponModule(db, rifle, 'muzzle', muffler, { allowUnverified: true, dryRun: false });
    expect(getPlacement(db, muffler)).toMatchObject({
      location: 'weapon_module',
      module_slot: 'muzzle',
      verified: 0,
    });

    expectWriteError(
      () => setWeaponModule(db, rifle, 'grip', muffler, { allowUnverified: true, dryRun: false }),
      'INVALID_PLACEMENT',
    );

    setWeaponModule(db, rifle, 'scope', null, { dryRun: false });
    expect(getPlacement(db, scope)).toMatchObject({ location: 'loose' });
  });

  it('returns weapon modules to loose when the weapon is deleted', () => {
    const rifle = make('weapon', 'АК-12');
    const scope = make('attachment', 'Прицел');
    replaceExboCompat(db, [{ attachmentItemId: scopeId, weaponItemId: weaponId }]);
    setWeaponModule(db, rifle, 'scope', scope, { dryRun: false });

    deleteInventoryItem(db, rifle, { dryRun: false });
    expect(getInventoryItem(db, rifle)).toBeNull();
    expect(getPlacement(db, scope)).toMatchObject({ location: 'loose' });
  });

  it('auto-arranges loose items deterministically and leaves non-fitting items loose', () => {
    const smallId = (
      createStorage(db, StorageCreateSchema.parse({ name: 'Small', width: 2, height: 2, dryRun: false })).diff
        .after as { id: number }
    ).id;
    const artifact = make('artifact', 'Нервяк');
    const rifle = make('weapon', 'АК-12');

    const result = autoArrangeStorage(db, smallId, { dryRun: false });
    expect(result.diff.after).toMatchObject({
      placed: [{ id: artifact, x: 0, y: 0 }],
      unplaced: [rifle],
    });
    expect(getPlacement(db, artifact)).toMatchObject({ location: 'grid', storage_id: smallId, x: 0, y: 0 });
    expect(getPlacement(db, rifle)).toMatchObject({ location: 'loose' });
    expect(getEvent(db, result.eventId!)?.action).toBe('inventory.autoArrange');

    const again = autoArrangeStorage(db, smallId, { dryRun: false });
    expect(again.eventId).toBeUndefined();
    expect(getPlacement(db, artifact)).toMatchObject({ x: 0, y: 0 });
  });

  it('rejects a layout change that breaks a placed instance and writes no layout on a dry run', () => {
    const rifle = make('weapon', 'АК-12');
    moveInventoryItem(db, rifle, grid(inventoryId, 3, 0), { dryRun: false });
    const events = eventCount(db);

    expectWriteError(
      () => setItemLayout(db, weaponId, { width: 6, height: 2 }, { dryRun: false }),
      'LAYOUT_CONFLICT',
    );
    expect(getItemLayout(db, weaponId)).toBeNull();
    expect(eventCount(db)).toBe(events);

    const dry = setItemLayout(db, weaponId, { width: 5, height: 3 }, { dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(getItemLayout(db, weaponId)).toBeNull();

    const shrink = setItemLayout(db, weaponId, { width: 4, height: 2 }, { dryRun: false });
    expect(shrink.eventId).toBeDefined();
    expect(getItemLayout(db, weaponId)).toMatchObject({ width: 4, height: 2 });
    expect(getEvent(db, shrink.eventId!)?.action).toBe('catalog.itemLayout.update');
  });

  it('does not change a placement or write an event on a dry-run move', () => {
    const rifle = make('weapon', 'АК-12');
    const events = eventCount(db);
    const result = moveInventoryItem(db, rifle, grid(stashId, 0, 0), { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(getPlacement(db, rifle)).toMatchObject({ location: 'loose' });
    expect(eventCount(db)).toBe(events);
  });

  it('creates an instance directly at a target with one event', () => {
    const events = eventCount(db);
    const result = createInventoryItem(
      db,
      InventoryItemCreateSchema.parse({
        name: 'АК-12',
        kind: 'weapon',
        target: { location: 'equipment', slot: 'primary' },
        dryRun: false,
      }),
    );
    const id = (result.diff.after as { id: number }).id;
    expect(result.diff.after).toMatchObject({ placement: { location: 'equipment', slot: 'primary' } });
    expect(getPlacement(db, id)).toMatchObject({ location: 'equipment', equipment_slot: 'primary' });
    expect(eventCount(db)).toBe(events + 1);
    expect(getEvent(db, result.eventId!)?.action).toBe('inventory.item.create');
  });

  it('writes a skin-only change', () => {
    const rifle = make('weapon', 'АК-12');
    item('motif', 'Камуфляж', null, null, 'skin');

    const result = updateInventoryItem(db, rifle, { skin: 'Камуфляж', dryRun: false });
    expect(result.eventId).toBeTypeOf('number');
    expect(getInventoryItem(db, rifle)?.skin_item_id).toBeTypeOf('number');

    const cleared = updateInventoryItem(db, rifle, { skin: null, dryRun: false });
    expect(cleared.eventId).toBeTypeOf('number');
    expect(getInventoryItem(db, rifle)?.skin_item_id).toBeNull();
  });

  it('reorders a fill without colliding with a retained artifact', () => {
    const bag = makeContainer('Контейнер', 2);
    const a = make('artifact', 'Нервяк');
    const b = make('artifact', 'Нервяк');
    setContainerFill(db, bag, [a, null], { dryRun: false });

    setContainerFill(db, bag, [b, a], { dryRun: false });
    expect(getPlacement(db, b)).toMatchObject({ container_item_id: bag, container_slot: 0 });
    expect(getPlacement(db, a)).toMatchObject({ container_item_id: bag, container_slot: 1 });
  });

  it('rolls back a shifted fill', () => {
    const bag = makeContainer('Контейнер', 2);
    const a = make('artifact', 'Нервяк');
    const b = make('artifact', 'Нервяк');
    setContainerFill(db, bag, [a, null], { dryRun: false });
    const shifted = setContainerFill(db, bag, [b, a], { dryRun: false });

    rollbackEvent(db, shifted.eventId!, false);
    expect(getPlacement(db, a)).toMatchObject({ container_item_id: bag, container_slot: 0 });
    expect(getPlacement(db, b)).toMatchObject({ location: 'loose' });
  });

  it('returns an incoming artifact to its previous container on fill rollback', () => {
    const first = makeContainer('Контейнер', 2);
    const second = makeContainer('Контейнер', 2);
    const a = make('artifact', 'Нервяк');
    const b = make('artifact', 'Нервяк');
    setContainerFill(db, first, [a], { dryRun: false });
    setContainerFill(db, second, [b], { dryRun: false });

    const moved = setContainerFill(db, first, [b], { dryRun: false });
    expect(getPlacement(db, b)).toMatchObject({ container_item_id: first, container_slot: 0 });
    expect(getPlacement(db, a)).toMatchObject({ location: 'loose' });

    rollbackEvent(db, moved.eventId!, false);
    expect(getPlacement(db, b)).toMatchObject({ container_item_id: second, container_slot: 0 });
    expect(getPlacement(db, a)).toMatchObject({ container_item_id: first, container_slot: 0 });
  });
});
