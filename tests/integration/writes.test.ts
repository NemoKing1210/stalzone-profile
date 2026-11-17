import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BuildInputSchema,
  CharacterPatchSchema,
  ContainerFillSchema,
  OwnedCreateSchema,
  OwnedPatchSchema,
} from '@dossier/shared';
import {
  buildPayload,
  closeDb,
  ensureDefaultSources,
  getBuild,
  getCharacter,
  getOwned,
  listContainerSlots,
  listEvents,
  listOwned,
  migrate,
  openDb,
  upsertCharacter,
  upsertItem,
  type Db,
} from '@dossier/core';
import * as repo from '@dossier/core';
import {
  createOwned,
  deleteBuild,
  deleteOwned,
  patchCharacter,
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
  return upsertItem(db, { sourceId: 'local', externalId: `test:${kind}:${name}`, name, kind });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-writes-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  ensureDefaultSources(db);
  characterId = upsertCharacter(db, { nick: 'tester', region: 'ru' });

  ids.ak12 = item('АК-12', 'weapon');
  ids.ak15 = item('АК-15', 'weapon');
  ids.akm = item('АКМ', 'weapon');
  ids.nervyak = item('Нервяк', 'artifact');
  ids.korka = item('Корка', 'artifact');
  ids.backpack = item('Рюкзак', 'container');
  ids.camo = item('Камуфляж', 'motif');

  repo.setCharacterStat(db, characterId, 'kil', 250, 'api');
  repo.setCharacterStat(db, characterId, 'dea', 100, 'api');
  repo.setCharacterStat(db, characterId, 'pla-tim', 'PT123H', 'api');

  repo.upsertOwned(db, {
    characterId,
    itemId: ids.nervyak,
    kind: 'artifact',
    level: 15,
    qty: 3,
    displayName: 'Нервяк',
  });
  repo.upsertOwned(db, {
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
  return (db.prepare(`SELECT COUNT(*) AS c FROM owned_item`).get() as { c: number }).c;
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

  it('stores a container override with the owned row', () => {
    const result = createOwned(
      db,
      OwnedCreateSchema.parse({
        name: 'Рюкзак',
        kind: 'container',
        qty: 1,
        dryRun: false,
        container: { containerType: 'Рюкзак', slots: 4, eff: 80, protection: 10 },
      }),
    );
    expect(repo.getOwnedContainer(db, Number((result.diff.after as { id: number }).id))).toMatchObject({
      container_type: 'Рюкзак',
      slots: 4,
      eff: 80,
      protection: 10,
    });
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

  it('resolves a skin by exact motif name and clears it with null', () => {
    const ownedId = repo.upsertOwned(db, {
      characterId,
      itemId: ids.ak15,
      kind: 'weapon',
      level: 3,
      qty: 1,
    });
    updateOwned(db, ownedId, OwnedPatchSchema.parse({ skin: 'Камуфляж', dryRun: false }));
    expect(getOwned(db, ownedId)).toMatchObject({ skin_item_id: ids.camo, skin_name: 'Камуфляж' });

    expect(() =>
      updateOwned(db, ownedId, OwnedPatchSchema.parse({ skin: 'Несуществующий облик', dryRun: false })),
    ).toThrowError(WriteError);
    expect(getOwned(db, ownedId)?.skin_item_id).toBe(ids.camo);

    updateOwned(db, ownedId, OwnedPatchSchema.parse({ skin: null, dryRun: false }));
    expect(getOwned(db, ownedId)?.skin_item_id).toBeNull();
  });

  it('sets and clears a container override', () => {
    const [container] = listOwned(db, characterId, 'container');
    updateOwned(db, container.id, OwnedPatchSchema.parse({ container: { slots: 6 }, dryRun: false }));
    expect(repo.getOwnedContainer(db, container.id)?.slots).toBe(6);

    updateOwned(db, container.id, OwnedPatchSchema.parse({ container: null, dryRun: false }));
    expect(repo.getOwnedContainer(db, container.id)).toBeNull();
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

  it('restores a deleted container with its override and fill', () => {
    const container = listOwned(db, characterId, 'container')[0];
    updateOwned(
      db,
      container.id,
      OwnedPatchSchema.parse({
        container: { containerType: 'backpack', shield: 12, slots: 4, eff: 80 },
        dryRun: false,
      }),
    );
    setContainerFill(
      db,
      container.id,
      ContainerFillSchema.parse({
        artifacts: [{ name: 'Корка', level: 5, quality: 'Редкий' }],
        dryRun: false,
      }),
    );

    const removed = deleteOwned(db, container.id, { dryRun: false, qty: 1 });
    expect(getOwned(db, container.id)).toBeNull();
    expect(listContainerSlots(db, container.id)).toHaveLength(0);

    rollbackEvent(db, removed.eventId!, false);

    const restored = listOwned(db, characterId, 'container')[0];
    expect(restored.id).toBeTypeOf('number');
    expect(repo.getOwnedContainer(db, restored.id)).toMatchObject({
      container_type: 'backpack',
      shield: 12,
      slots: 4,
      eff: 80,
    });
    const fill = listContainerSlots(db, restored.id);
    expect(fill).toHaveLength(1);
    expect(fill[0]).toMatchObject({ artifact_item_id: ids.korka, level: 5, quality: 'Редкий' });
  });
});

describe('setContainerFill', () => {
  it('stores container overrides and rolls the fill back', () => {
    const container = createOwned(
      db,
      OwnedCreateSchema.parse({
        name: 'Рюкзак',
        kind: 'container',
        level: 0,
        qty: 1,
        dryRun: false,
        container: { slots: 4, eff: 80, protection: 10 },
      }),
    );
    const ownedId = Number((container.diff.after as { id: number }).id);
    const fill = setContainerFill(
      db,
      ownedId,
      ContainerFillSchema.parse({ artifacts: [{ name: 'Нервяк', level: 15 }], dryRun: false }),
    );
    expect(repo.getOwnedContainer(db, ownedId)).toMatchObject({ slots: 4, eff: 80 });
    rollbackEvent(db, fill.eventId!, false);
    expect(listContainerSlots(db, ownedId)).toEqual([]);
  });

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
    expect(listContainerSlots(db, container.id).map((row) => row.artifact_item_id)).toEqual([
      ids.nervyak,
      ids.korka,
    ]);
    expect(listEvents(db)[0].action).toBe('container.fill');
  });

  it('rejects an unknown artifact and keeps the old fill', () => {
    const container = listOwned(db, characterId, 'container')[0];
    const input = ContainerFillSchema.parse({ artifacts: [{ name: 'Неизвестный', level: 1 }], dryRun: false });
    expect(() => setContainerFill(db, container.id, input)).toThrowError(WriteError);
    expect(listContainerSlots(db, container.id)).toHaveLength(0);
  });

  it('refuses a fill rollback when its container is gone', () => {
    const container = listOwned(db, characterId, 'container')[0];
    const fill = setContainerFill(
      db,
      container.id,
      ContainerFillSchema.parse({ artifacts: [{ name: 'Корка', level: 5 }], dryRun: false }),
    );
    deleteOwned(db, container.id, { dryRun: false, qty: 1 });

    try {
      rollbackEvent(db, fill.eventId!, false);
      throw new Error('expected WriteError');
    } catch (error) {
      expect(error).toBeInstanceOf(WriteError);
      expect((error as WriteError).code).toBe('OWNED_NOT_FOUND');
    }
  });
});

describe('builds', () => {
  const build = () =>
    BuildInputSchema.parse({
      slug: 'test-build',
      title: 'Тестовая сборка',
      container: 'Рюкзак',
      total: 12345,
      metrics: [{ l: 'DPS', v: '550' }],
      rows: [{ name: 'Нервяк', quality: 'Редкий', price: 1000, why: 'тест' }],
      dryRun: false,
    });

  it('saves, deletes and restores through rollback', () => {
    const saved = saveBuild(db, build());
    expect(saved.eventId).toBeTypeOf('number');
    expect(getBuild(db, 'test-build')).toMatchObject({ title: 'Тестовая сборка' });
    expect(repo.listBuildMetrics(db, getBuild(db, 'test-build')!.id)).toHaveLength(1);
    const slots = db.prepare(`SELECT * FROM build_slot`).all() as { item_id: number | null }[];
    expect(slots[0].item_id).toBe(ids.nervyak);

    const removed = deleteBuild(db, 'test-build', false);
    expect(getBuild(db, 'test-build')).toBeNull();

    rollbackEvent(db, removed.eventId!, false);
    expect(getBuild(db, 'test-build')).toMatchObject({ title: 'Тестовая сборка' });
    expect(repo.listBuildMetrics(db, getBuild(db, 'test-build')!.id)).toHaveLength(1);
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

describe('character', () => {
  it('edits raw character stats and treats null as clearing the manual override', () => {
    const result = patchCharacter(
      db,
      CharacterPatchSchema.parse({
        stats: { kil: 300, dea: 100, 'reg-tim': '2024-06-01' },
        dryRun: false,
      }),
    );
    expect((result.diff.after as { stats: Record<string, unknown> }).stats).toMatchObject({
      kil: 300,
      dea: 100,
      'reg-tim': '2024-06-01',
    });
    expect(buildPayload(db).character.kd).toBe(3);
    patchCharacter(db, CharacterPatchSchema.parse({ stats: { kil: null }, dryRun: false }));
    expect(buildPayload(db).character.kd).toBe(2.5);
    expect(
      repo.listCharacterStats(db, repo.getCharacter(db)!.id).find((row) => row.stat_id === 'kil' && row.origin === 'manual'),
    ).toBeUndefined();
  });

  it('does not accept derived character fields', () => {
    const parsed = CharacterPatchSchema.safeParse({ kd: 9 });
    expect(parsed.success).toBe(false);
  });

  it('rolls back a character stat patch', () => {
    const wrote = patchCharacter(db, CharacterPatchSchema.parse({ stats: { kil: 300 }, dryRun: false }));
    rollbackEvent(db, wrote.eventId!, false);
    expect(buildPayload(db).character.kd).toBe(2.5);
  });

  it('patches identity fields and rolls back', () => {
    const patch = CharacterPatchSchema.parse({ nick: 'tester-2', playstyle: 'снайпер', dryRun: false });
    const result = patchCharacter(db, patch);
    expect(result.eventId).toBeTypeOf('number');
    expect(getCharacter(db, characterId)).toMatchObject({ nick: 'tester-2', playstyle: 'снайпер' });

    rollbackEvent(db, result.eventId!, false);
    expect(getCharacter(db, characterId)).toMatchObject({ nick: 'tester', playstyle: null });
  });

  it('does not write on dry run', () => {
    patchCharacter(db, CharacterPatchSchema.parse({ playstyle: 'снайпер', dryRun: true }));
    expect(getCharacter(db, characterId)?.playstyle).toBeNull();
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
