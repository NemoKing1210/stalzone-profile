import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CharacterCreateSchema, OwnedCreateSchema } from '@dossier/shared';
import {
  closeDb,
  ensureDefaultSources,
  getCharacter,
  listEvents,
  migrate,
  openDb,
  type Db,
  createCharacter,
  createOwned,
  rollbackEvent,
} from '@dossier/core';
import { upsertItem } from '@dossier/core/testing';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-character-create-'));
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
    createOwned(db, OwnedCreateSchema.parse({ name: 'Нервяк', kind: 'artifact', qty: 1, dryRun: false }));

    expect(() => rollbackEvent(db, again.eventId!, false)).toThrowError(
      expect.objectContaining({ status: 409, code: 'CHARACTER_NOT_EMPTY' }),
    );
    expect(getCharacter(db)).toMatchObject({ nick: 'Tester' });
  });
});
