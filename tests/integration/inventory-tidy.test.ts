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
import { InventoryItemCreateSchema, TidyStorageSchema } from '@profile/shared/contracts';
import {
  createInventoryItem,
  createStorage,
  ensureInventoryStorage,
  getPlacement,
  getStorage,
  tidyStorage,
  upsertPlacement,
} from '@profile/core/modules/inventory';
import * as seed from '@profile/core/testing';

let dir: string;
let db: Db;
let characterId: number;
let storageId: number;

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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-inventory-tidy-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
  characterId = seed.upsertCharacter(db, { nick: 'tester', region: 'ru' });
  ensureInventoryStorage(db, characterId);
  storageId = idOf(createStorage(db, { kind: 'stash', name: 'Stash', dryRun: false }));
  seed.upsertItem(db, {
    sourceId: 'local',
    externalId: 'tidy:rifle',
    name: 'АК-12',
    kind: 'weapon',
    category: 'weapon/assault_rifle',
  });
  seed.upsertItem(db, {
    sourceId: 'local',
    externalId: 'tidy:artifact',
    name: 'Артефакт',
    kind: 'artifact',
    category: 'artefact/gravity',
  });
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('tidy storage', () => {
  it('packs items by order as one audited write and rolls back', () => {
    const rifle = idOf(
      createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon', dryRun: false })),
    );
    const artifact = idOf(
      createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Артефакт', kind: 'artifact', dryRun: false })),
    );
    upsertPlacement(db, { itemId: rifle, characterId, location: 'grid', storageId, x: 0, y: 5 });
    upsertPlacement(db, { itemId: artifact, characterId, location: 'grid', storageId, x: 3, y: 5 });

    const result = tidyStorage(db, storageId, TidyStorageSchema.parse({ order: 'name', dryRun: false }));
    expect(result.eventId).toBeTypeOf('number');
    expect(getEvent(db, result.eventId!)?.action).toBe('inventory.storage.tidy');
    expect(getPlacement(db, rifle)).toMatchObject({ x: 0, y: 0 });
    expect(getPlacement(db, artifact)).toMatchObject({ x: 5, y: 0 });

    rollbackEvent(db, result.eventId!, false);
    expect(getPlacement(db, rifle)).toMatchObject({ x: 0, y: 5 });
    expect(getPlacement(db, artifact)).toMatchObject({ x: 3, y: 5 });
  });

  it('writes nothing on a dry run or when the storage is already packed', () => {
    const artifact = idOf(
      createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Артефакт', kind: 'artifact', dryRun: false })),
    );
    upsertPlacement(db, { itemId: artifact, characterId, location: 'grid', storageId, x: 0, y: 0 });
    const before = eventCount(db);
    const dry = tidyStorage(db, storageId, TidyStorageSchema.parse({ order: 'kind', dryRun: true }));
    expect(dry.dryRun).toBe(true);
    expect(dry.eventId).toBeUndefined();
    expect(eventCount(db)).toBe(before);

    const real = tidyStorage(db, storageId, TidyStorageSchema.parse({ order: 'kind', dryRun: false }));
    expect(real.eventId).toBeUndefined();
    expect(getPlacement(db, artifact)).toMatchObject({ x: 0, y: 0 });
  });

  it('keeps an item that cannot be packed at its cells and reports it', () => {
    const small = seed.insertStorage(db, {
      characterId,
      kind: 'stash',
      name: 'Tiny',
      width: 4,
      height: 4,
      sortOrder: 0,
    });
    const artifact = idOf(
      createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Артефакт', kind: 'artifact', dryRun: false })),
    );
    const rifle = idOf(
      createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon', dryRun: false })),
    );
    upsertPlacement(db, { itemId: artifact, characterId, location: 'grid', storageId: small, x: 0, y: 0 });
    upsertPlacement(db, { itemId: rifle, characterId, location: 'grid', storageId: small, x: 0, y: 2 });

    const result = tidyStorage(db, small, TidyStorageSchema.parse({ order: 'kind', dryRun: false }));
    expect(result.diff.after).toMatchObject({ unplaced: [rifle] });
    expect(getPlacement(db, rifle)).toMatchObject({ x: 0, y: 2 });
  });

  it('refuses the read-only intake storage', () => {
    const intake = seed.insertStorage(db, {
      characterId,
      kind: 'overflow',
      name: 'Intake',
      width: 40,
      height: 80,
      sortOrder: 0,
    });
    expectWriteError(
      () => tidyStorage(db, intake, TidyStorageSchema.parse({ dryRun: false })),
      'VALIDATION',
    );
    expect(getStorage(db, intake)?.kind).toBe('overflow');
  });
});
