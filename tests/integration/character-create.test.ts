import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CharacterCreateSchema, CharacterPatchSchema, InventoryItemCreateSchema } from '@profile/shared';
import {
  closeDb,
  ensureDefaultSources,
  getCharacter,
  getCharacterRead,
  inventoryRead,
  listEvents,
  migrate,
  openDb,
  type Db,
  createCharacter,
  createInventoryItem,
  createSetupCharacter,
  patchCharacter,
  rollbackEvent,
} from '@profile/core';
import { setCharacterStat, upsertCharacter, upsertItem } from '@profile/core/testing';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-character-create-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('createCharacter', () => {
  it('writes the character and one character.create event', () => {
    const result = createCharacter(
      db,
      CharacterCreateSchema.parse({ nick: 'Tester', region: 'eu', faction: 'rise' }),
    );

    expect(result.dryRun).toBe(false);
    expect(result.eventId).toBeTypeOf('number');
    expect(getCharacter(db)).toMatchObject({ nick: 'Tester', region: 'eu', faction: 'rise' });

    const [event] = listEvents(db);
    expect(event).toMatchObject({ action: 'character.create', entity: 'character' });
    expect(JSON.parse(event.before!)).toBeNull();
    expect(JSON.parse(event.after!)).toMatchObject({ nick: 'Tester', faction: 'rise', stats: {} });
  });

  it('rejects a second character with 409 and writes nothing', () => {
    createCharacter(db, CharacterCreateSchema.parse({ nick: 'Tester', region: 'ru' }));
    const eventsBefore = listEvents(db).length;

    expect(() => createCharacter(db, CharacterCreateSchema.parse({ nick: 'Second', region: 'ru' }))).toThrowError(
      expect.objectContaining({ status: 409, code: 'CHARACTER_EXISTS' }),
    );
    expect(getCharacter(db)).toMatchObject({ nick: 'Tester' });
    expect(listEvents(db)).toHaveLength(eventsBefore);
  });

  it('does not write on dry run', () => {
    const result = createCharacter(db, CharacterCreateSchema.parse({ nick: 'Tester', region: 'ru', dryRun: true }));

    expect(result.dryRun).toBe(true);
    expect(getCharacter(db)).toBeNull();
    expect(listEvents(db)).toHaveLength(0);
  });

  it('rolls back a character without gear and refuses once gear exists', () => {
    const created = createCharacter(db, CharacterCreateSchema.parse({ nick: 'Tester', region: 'ru' }));
    rollbackEvent(db, created.eventId!, false);
    expect(getCharacter(db)).toBeNull();

    const again = createCharacter(db, CharacterCreateSchema.parse({ nick: 'Tester', region: 'ru' }));
    upsertItem(db, { sourceId: 'local', externalId: 'test:artifact:Нервяк', name: 'Нервяк', kind: 'artifact' });
    createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Нервяк', kind: 'artifact', qty: 1, dryRun: false }));

    expect(() => rollbackEvent(db, again.eventId!, false)).toThrowError(
      expect.objectContaining({ status: 409, code: 'CHARACTER_NOT_EMPTY' }),
    );
    expect(getCharacter(db)).toMatchObject({ nick: 'Tester' });
  });
});

describe('createSetupCharacter', () => {
  it('creates the character together with the default inventory and stash', () => {
    const result = createSetupCharacter(db, CharacterCreateSchema.parse({ nick: 'Tester', region: 'ru' }));

    expect(result.eventId).toBeTypeOf('number');
    const character = getCharacter(db);
    expect(character).toMatchObject({ nick: 'Tester' });

    const inventory = inventoryRead(db, character!.id);
    expect(inventory.storages.map((storage) => [storage.kind, storage.name, storage.width, storage.height])).toEqual([
      ['inventory', 'Inventory', 8, 20],
      ['overflow', 'Intake', 40, 80],
      ['stash', 'Stash', 8, 200],
    ]);
  });

  it('does not create storages on dry run', () => {
    const result = createSetupCharacter(
      db,
      CharacterCreateSchema.parse({ nick: 'Tester', region: 'ru', dryRun: true }),
    );

    expect(result.dryRun).toBe(true);
    expect(getCharacter(db)).toBeNull();
    expect(listEvents(db)).toHaveLength(0);
  });
});

describe('patchCharacter and the fetched profile marker', () => {
  const marker = '2026-01-01T00:00:00.000Z';

  it('clears the marker when the nick changes, and rollback restores it', () => {
    upsertCharacter(db, { nick: 'Tester', region: 'ru', profileFetchedAt: marker });

    patchCharacter(db, CharacterPatchSchema.parse({ money: 500 }));
    expect(getCharacterRead(db)?.profileFetchedAt).toBe(marker);

    const renamed = patchCharacter(db, CharacterPatchSchema.parse({ nick: 'Renamed' }));
    expect(getCharacterRead(db)?.profileFetchedAt).toBeNull();
    expect(renamed.diff.after).toMatchObject({ nick: 'Renamed', profileFetchedAt: null });

    rollbackEvent(db, renamed.eventId!, false);
    expect(getCharacterRead(db)).toMatchObject({ nick: 'Tester', profileFetchedAt: marker });
  });

  it('clears the marker when the region changes', () => {
    upsertCharacter(db, { nick: 'Tester', region: 'ru', profileFetchedAt: marker });

    patchCharacter(db, CharacterPatchSchema.parse({ region: 'eu' }));
    expect(getCharacterRead(db)).toMatchObject({ region: 'eu', profileFetchedAt: null });
  });
});

describe('patchCharacter clearing a manual stat', () => {
  function seededCharacter(): { id: number } {
    createCharacter(db, CharacterCreateSchema.parse({ nick: 'Tester', region: 'ru' }));
    const character = getCharacter(db)!;
    setCharacterStat(db, character.id, 'kil', 250, 'api', '2026-01-01T00:00:00.000Z');
    patchCharacter(db, CharacterPatchSchema.parse({ stats: { kil: 300 } }));
    return character;
  }

  it('reports the revealed API value in the diff and the event', () => {
    seededCharacter();
    const cleared = patchCharacter(db, CharacterPatchSchema.parse({ stats: { kil: null } }));

    expect(cleared.diff.after).toMatchObject({ stats: { kil: 250 }, manualStats: [] });
    expect(getCharacterRead(db)?.stats.kil).toBe(250);

    const event = listEvents(db).find((row) => row.id === cleared.eventId)!;
    expect(JSON.parse(event.after!)).toMatchObject({ stats: { kil: 250 }, manualStats: [] });
  });

  it('does not change the database on a dry run', () => {
    seededCharacter();
    const before = getCharacterRead(db)?.stats.kil;

    const preview = patchCharacter(db, CharacterPatchSchema.parse({ stats: { kil: null }, dryRun: true }));

    expect(preview.dryRun).toBe(true);
    expect(preview.diff.after).toMatchObject({ stats: { kil: 250 } });
    expect(getCharacterRead(db)?.stats.kil).toBe(before);
  });
});
