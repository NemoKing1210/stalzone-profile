import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BuildInputSchema,
  CharacterPatchSchema,
  ContainerFillSchema,
  ContentBlockInputSchema,
  OwnedCreateSchema,
  OwnedPatchSchema,
} from '@dossier/shared';
import {
  closeDb,
  ensureDefaultSources,
  getBuild,
  getCharacter,
  getOwned,
  listEvents,
  listOwned,
  migrate,
  openDb,
  upsertCharacter,
  upsertItem,
  upsertOwned,
  type Db,
} from '@dossier/core';
import {
  createOwned,
  deleteBuild,
  deleteOwned,
  patchCharacter,
  putContentBlock,
  rollbackEvent,
  saveBuild,
  setContainerFill,
  updateOwned,
  WriteError,
} from '@dossier/core/services/writes';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

let dir: string;
let db: Db;
let characterId: number;
const ids: Record<string, number> = {};

function item(name: string, kind: string): number {
  return upsertItem(db, { sourceId: 'local', exboId: `test:${kind}:${name}`, name, kind });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-writes-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  ensureDefaultSources(db);
  characterId = upsertCharacter(db, { nick: 'tester', realm: 'ru' });

  ids.ak12 = item('АК-12', 'weapon');
  ids.ak15 = item('АК-15', 'weapon');
  ids.akm = item('АКМ', 'weapon');
  ids.nervyak = item('Нервяк', 'artifact');
  ids.korka = item('Корка', 'artifact');
  ids.backpack = item('Рюкзак', 'container');
  ids.camo = item('Камуфляж', 'motif');

  upsertOwned(db, {
    characterId,
    itemId: ids.nervyak,
    kind: 'artifact',
    level: 15,
    qty: 3,
    displayName: 'Нервяк',
  });
  upsertOwned(db, {
    characterId,
    itemId: ids.backpack,
    kind: 'container',
    level: 0,
    qty: 1,
    displayName: 'Рюкзак',
  });
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

function ownedCount(): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM owned`).get() as { c: number }).c;
}

describe('createOwned', () => {
  it('does not touch the database or event log on dry run', () => {
    const input = OwnedCreateSchema.parse({ name: 'АК-12', kind: 'weapon', level: 10, qty: 2, dryRun: true });
    const result = createOwned(db, input);
    expect(result.dryRun).toBe(true);
    expect(result.eventId).toBeUndefined();
    expect(result.diff.before).toBeNull();
    expect(result.diff.after).toMatchObject({ name: 'АК-12', level: 10, qty: 2 });
    expect(listOwned(db, characterId, 'weapon')).toHaveLength(0);
    expect(listEvents(db)).toHaveLength(0);
  });

  it('inserts the item and logs one event', () => {
    const input = OwnedCreateSchema.parse({ name: 'АК-12', kind: 'weapon', level: 10, qty: 2, dryRun: false });
    const result = createOwned(db, input);
    expect(result.dryRun).toBe(false);
    expect(result.eventId).toBeTypeOf('number');
    expect(listOwned(db, characterId, 'weapon')).toHaveLength(1);
    const [event] = listEvents(db);
    expect(event).toMatchObject({ action: 'owned.create', entity: 'owned' });
    expect(JSON.parse(event.after!)).toMatchObject({ name: 'АК-12', qty: 2 });
  });

  it('adds copies to an existing identical row', () => {
    const input = OwnedCreateSchema.parse({ name: 'Нервяк', kind: 'artifact', level: 15, qty: 2, dryRun: false });
    const result = createOwned(db, input);
    expect(result.diff.human).toContain('3');
    expect(result.diff.human).toContain('5');
    const rows = listOwned(db, characterId, 'artifact');
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(5);
  });

  it('rejects an unknown item with suggestions and no insert', () => {
    const input = OwnedCreateSchema.parse({ name: 'АК-13', kind: 'weapon', dryRun: false });
    try {
      createOwned(db, input);
      throw new Error('expected WriteError');
    } catch (error) {
      expect(error).toBeInstanceOf(WriteError);
      const err = error as WriteError;
      expect(err.status).toBe(422);
      expect(err.code).toBe('UNKNOWN_ITEM');
      expect(err.details).toMatchObject({ suggestions: expect.arrayContaining(['АК-12']) });
    }
    expect(ownedCount()).toBe(2);
    expect(listEvents(db)).toHaveLength(0);
  });
});

describe('updateOwned', () => {
  it('never writes on dry run', () => {
    const [row] = listOwned(db, characterId, 'artifact');
    const patch = OwnedPatchSchema.parse({ qty: 1, dryRun: true });
    const result = updateOwned(db, row.id, patch);
    expect(result.diff).toMatchObject({ before: { qty: 3 }, after: { qty: 1 } });
    expect(getOwned(db, row.id)?.qty).toBe(3);
    expect(listEvents(db)).toHaveLength(0);
  });

  it('updates the row and logs before/after', () => {
    const [row] = listOwned(db, characterId, 'artifact');
    const patch = OwnedPatchSchema.parse({ qty: 1, note: 'на полке', dryRun: false });
    const result = updateOwned(db, row.id, patch);
    expect(result.eventId).toBeTypeOf('number');
    expect(getOwned(db, row.id)).toMatchObject({ qty: 1, note: 'на полке' });
    const [event] = listEvents(db);
    expect(event.action).toBe('owned.update');
    expect(JSON.parse(event.before!)).toMatchObject({ qty: 3 });
    expect(JSON.parse(event.after!)).toMatchObject({ qty: 1, note: 'на полке' });
  });

  it('reports a missing row as 404', () => {
    const patch = OwnedPatchSchema.parse({ qty: 1 });
    expect(() => updateOwned(db, 999_999, patch)).toThrowError(WriteError);
  });
});

describe('deleteOwned with copies', () => {
  it('decrements quantity instead of dropping the row', () => {
    const [row] = listOwned(db, characterId, 'artifact');
    const result = deleteOwned(db, row.id, { dryRun: false });
    expect(result.diff.human).toContain('3');
    expect(result.diff.human).toContain('2');
    expect(getOwned(db, row.id)?.qty).toBe(2);
    expect(listEvents(db)[0].action).toBe('owned.delete');
  });

  it('removes the row when the last copy goes', () => {
    const [row] = listOwned(db, characterId, 'artifact');
    deleteOwned(db, row.id, { dryRun: false, qty: 3 });
    expect(getOwned(db, row.id)).toBeNull();
  });

  it('keeps everything on dry run', () => {
    const [row] = listOwned(db, characterId, 'artifact');
    deleteOwned(db, row.id, { dryRun: true, qty: 1 });
    expect(getOwned(db, row.id)?.qty).toBe(3);
    expect(listEvents(db)).toHaveLength(0);
  });
});

describe('setContainerFill', () => {
  it('replaces artifacts and logs the change', () => {
    const container = listOwned(db, characterId, 'container')[0];
    const input = ContainerFillSchema.parse({
      artifacts: [
        { name: 'Нервяк', level: 15, quality: 'Редкий 141%' },
        { name: 'Корка', level: 10 },
      ],
      dryRun: false,
    });
    const result = setContainerFill(db, container.id, input);
    expect(result.eventId).toBeTypeOf('number');
    expect((result.diff.after as { artifacts: unknown[] }).artifacts).toHaveLength(2);
    const fill = db
      .prepare(`SELECT * FROM container_fill WHERE container_owned_id = ? ORDER BY slot`)
      .all(container.id) as { artifact_item_id: number; level: number }[];
    expect(fill.map((row) => row.artifact_item_id)).toEqual([ids.nervyak, ids.korka]);
    expect(listEvents(db)[0].action).toBe('container.fill');
  });

  it('rejects an unknown artifact and keeps the old fill', () => {
    const container = listOwned(db, characterId, 'container')[0];
    const input = ContainerFillSchema.parse({ artifacts: [{ name: 'Неизвестный', level: 1 }], dryRun: false });
    expect(() => setContainerFill(db, container.id, input)).toThrowError(WriteError);
    const count = db.prepare(`SELECT COUNT(*) AS c FROM container_fill`).get() as { c: number };
    expect(count.c).toBe(0);
  });
});

describe('builds', () => {
  const build = () =>
    BuildInputSchema.parse({
      slug: 'test-build',
      title: 'Тестовая сборка',
      container: 'Рюкзак',
      total: 12345,
      rows: [{ name: 'Нервяк', quality: 'Редкий', price: 1000, why: 'тест' }],
      dryRun: false,
    });

  it('saves, deletes and restores through rollback', () => {
    const saved = saveBuild(db, build());
    expect(saved.eventId).toBeTypeOf('number');
    expect(getBuild(db, 'test-build')).toMatchObject({ title: 'Тестовая сборка' });
    const slots = db.prepare(`SELECT * FROM build_slot`).all() as { item_id: number | null }[];
    expect(slots[0].item_id).toBe(ids.nervyak);

    const removed = deleteBuild(db, 'test-build', false);
    expect(getBuild(db, 'test-build')).toBeNull();

    rollbackEvent(db, removed.eventId!, false);
    expect(getBuild(db, 'test-build')).toMatchObject({ title: 'Тестовая сборка' });
    expect(listEvents(db)[0].action).toBe('rollback');
  });

  it('does not delete on dry run', () => {
    saveBuild(db, build());
    const result = deleteBuild(db, 'test-build', true);
    expect(result.dryRun).toBe(true);
    expect(getBuild(db, 'test-build')).not.toBeNull();
  });

  it('reports a missing build as 404', () => {
    expect(() => deleteBuild(db, 'nope', false)).toThrowError(WriteError);
  });
});

describe('content blocks', () => {
  it('creates a note and rolls it back', () => {
    const input = ContentBlockInputSchema.parse({
      kind: 'notes',
      slug: 'note-test',
      title: 'Заметка',
      payload: { title: 'Заметка', text: 'текст' },
      dryRun: false,
    });
    const result = putContentBlock(db, input);
    expect(result.eventId).toBeTypeOf('number');
    const block = db.prepare(`SELECT * FROM content_block WHERE slug = 'note-test'`).get();
    expect(block).toBeTruthy();

    rollbackEvent(db, result.eventId!, false);
    expect(db.prepare(`SELECT * FROM content_block WHERE slug = 'note-test'`).get()).toBeUndefined();
  });
});

describe('character', () => {
  it('patches fields and rolls back', () => {
    const patch = CharacterPatchSchema.parse({ hours: 500, playstyle: 'снайпер', dryRun: false });
    const result = patchCharacter(db, patch);
    expect(result.eventId).toBeTypeOf('number');
    expect(getCharacter(db, characterId)).toMatchObject({ hours: 500, playstyle: 'снайпер' });

    rollbackEvent(db, result.eventId!, false);
    expect(getCharacter(db, characterId)).toMatchObject({ hours: null, playstyle: null });
  });

  it('does not write on dry run', () => {
    patchCharacter(db, CharacterPatchSchema.parse({ hours: 500, dryRun: true }));
    expect(getCharacter(db, characterId)?.hours).toBeNull();
    expect(listEvents(db)).toHaveLength(0);
  });
});

describe('rollback guards', () => {
  it('does nothing on dry run', () => {
    const [row] = listOwned(db, characterId, 'artifact');
    const update = updateOwned(db, row.id, OwnedPatchSchema.parse({ qty: 1, dryRun: false }));
    rollbackEvent(db, update.eventId!, true);
    expect(getOwned(db, row.id)?.qty).toBe(1);
    expect(listEvents(db)).toHaveLength(1);
  });

  it('rejects an unknown event', () => {
    expect(() => rollbackEvent(db, 999_999, false)).toThrowError(WriteError);
  });
});
