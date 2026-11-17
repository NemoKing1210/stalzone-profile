import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BuildInputSchema } from '@dossier/shared';
import {
  allBuildSlots,
  closeDb,
  ensureDefaultSources,
  listBuilds,
  listEvents,
  listOwned,
  migrate,
  openDb,
  replaceContainerFill,
  upsertCharacter,
  upsertItem,
  upsertOwned,
  type Db,
} from '@dossier/core';
import {
  cleanupCounts,
  clearAll,
  clearBuilds,
  clearOwned,
  rollbackEvent,
  saveBuild,
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

function build(slug: string): void {
  saveBuild(
    db,
    BuildInputSchema.parse({
      slug,
      title: `Сборка ${slug}`,
      rows: [{ name: 'Нервяк', quality: 'Редкий', price: 1000, why: 'тест' }],
      dryRun: false,
    }),
  );
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-cleanup-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  ensureDefaultSources(db);
  characterId = upsertCharacter(db, { nick: 'tester', realm: 'ru' });

  ids.nervyak = item('Нервяк', 'artifact');
  ids.korka = item('Корка', 'artifact');
  ids.backpack = item('Рюкзак', 'container');
  ids.attachment = item('Приклад', 'attachment');
  ids.ammo = item('Патроны', 'ammo');
  ids.motif = item('Камуфляж', 'motif');
  ids.other = item('Прочее', 'other');

  upsertOwned(db, { characterId, itemId: ids.nervyak, kind: 'artifact', level: 15, qty: 3, displayName: 'Нервяк' });
  const containerId = upsertOwned(db, {
    characterId,
    itemId: ids.backpack,
    kind: 'container',
    level: 0,
    qty: 1,
    displayName: 'Рюкзак',
  });
  replaceContainerFill(
    db,
    containerId,
    [
      { itemId: ids.nervyak, level: 15 },
      { itemId: ids.korka, level: 10 },
    ],
    '2026-01-01T00:00:00.000Z',
  );
  upsertOwned(db, { characterId, itemId: ids.attachment, kind: 'attachment', level: 0, qty: 1 });
  upsertOwned(db, { characterId, itemId: ids.ammo, kind: 'ammo', level: 0, qty: 1 });
  upsertOwned(db, { characterId, itemId: ids.motif, kind: 'motif', level: 0, qty: 1 });
  upsertOwned(db, { characterId, itemId: ids.other, kind: 'other', level: 0, qty: 1 });

  build('build-a');
  build('build-b');
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('cleanup counts', () => {
  it('counts every owned kind and sums qty separately from rows', () => {
    const counts = cleanupCounts(db);
    expect(counts.owned).toEqual({ records: 6, copies: 8 });
    expect(counts.builds).toBe(2);
  });

  it('returns zero owned counts when there is no character', () => {
    db.prepare(`DELETE FROM owned`).run();
    db.prepare(`DELETE FROM character`).run();
    expect(cleanupCounts(db).owned).toEqual({ records: 0, copies: 0 });
    expect(cleanupCounts(db).builds).toBe(2);
  });
});

describe('cleanup writes', () => {
  it('dry-runs inventory cleanup without writing rows or events', () => {
    const eventsBefore = listEvents(db).length;
    const result = clearOwned(db, true);
    expect(result).toMatchObject({ dryRun: true, diff: { after: null } });
    expect(result.eventId).toBeUndefined();
    expect(result.diff.human).toBe('Inventory cleared: 6 records, 8 copies');
    expect((result.diff.before as unknown[]).length).toBe(6);
    expect(listOwned(db, characterId)).toHaveLength(6);
    expect(listEvents(db)).toHaveLength(eventsBefore);
  });

  it('clears inventory and rollback restores rows and container fill', () => {
    const fillBefore = db.prepare(`SELECT * FROM container_fill`).all();
    expect(fillBefore).toHaveLength(2);

    const result = clearOwned(db, false);
    expect(listOwned(db, characterId)).toHaveLength(0);
    expect(db.prepare(`SELECT COUNT(*) AS c FROM container_fill`).get()).toEqual({ c: 0 });
    const event = listEvents(db)[0]!;
    expect(event).toMatchObject({ action: 'owned.clear', entity: 'owned', entity_id: 'all' });

    rollbackEvent(db, result.eventId!, false);
    expect(listOwned(db, characterId)).toHaveLength(6);
    expect(db.prepare(`SELECT * FROM container_fill`).all()).toHaveLength(fillBefore.length);
  });

  it('clears builds and rollback restores slots', () => {
    const result = clearBuilds(db, false);
    expect(listBuilds(db)).toHaveLength(0);
    expect(listEvents(db)[0]).toMatchObject({ action: 'build.clear', entity: 'build' });

    rollbackEvent(db, result.eventId!, false);
    expect(listBuilds(db)).toHaveLength(2);
    expect(allBuildSlots(db)[listBuilds(db)[0]!.id]?.length).toBeGreaterThan(0);
  });

  it('clears everything as one event and restores both scopes in one rollback', () => {
    const eventsBefore = listEvents(db).length;
    const result = clearAll(db, false);
    expect(listOwned(db, characterId)).toHaveLength(0);
    expect(listBuilds(db)).toHaveLength(0);
    expect(listEvents(db)).toHaveLength(eventsBefore + 1);
    expect(listEvents(db)[0]).toMatchObject({ action: 'dossier.clear', entity: 'dossier' });

    rollbackEvent(db, result.eventId!, false);
    expect(listOwned(db, characterId)).toHaveLength(6);
    expect(listBuilds(db)).toHaveLength(2);
  });

  it('rejects an empty scope without writing', () => {
    clearOwned(db, false);
    const eventsBefore = listEvents(db).length;
    expect(() => clearOwned(db, false)).toThrowError(WriteError);
    expect(listEvents(db)).toHaveLength(eventsBefore);
  });

  it('rollback fails rather than partially restores without a character', () => {
    const result = clearOwned(db, false);
    db.prepare(`DELETE FROM character`).run();
    try {
      rollbackEvent(db, result.eventId!, false);
      throw new Error('expected WriteError');
    } catch (error) {
      expect(error).toBeInstanceOf(WriteError);
      expect((error as WriteError).code).toBe('NO_CHARACTER');
    }
  });
});
