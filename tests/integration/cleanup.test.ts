import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BuildInputSchema } from '@dossier/shared';
import {
  allBuildSlots,
  closeDb,
  ensureDefaultSources,
  listBuildMetrics,
  listBuilds,
  listEvents,
  listOwned,
  migrate,
  openDb,
  type Db,
  cleanupCounts,
  clearAll,
  clearBuilds,
  clearOwned,
  rollbackEvent,
  saveBuild,
  WriteError,
} from '@dossier/core';
import { replaceContainerSlots, upsertCharacter, upsertItem, upsertOwned } from '@dossier/core/testing';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

let dir: string;
let db: Db;
let characterId: number;
const ids: Record<string, number> = {};

function item(name: string, kind: string): number {
  return upsertItem(db, { sourceId: 'local', externalId: `test:${kind}:${name}`, name, kind });
}

function build(slug: string): void {
  saveBuild(
    db,
    BuildInputSchema.parse({
      slug,
      title: `Сборка ${slug}`,
      metrics: [{ l: 'DPS', v: '550' }],
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
  characterId = upsertCharacter(db, { nick: 'tester', region: 'ru' });

  ids.nervyak = item('Нервяк', 'artifact');
  ids.korka = item('Корка', 'artifact');
  ids.backpack = item('Рюкзак', 'container');
  ids.ak12 = item('АК-12', 'weapon');
  ids.akm = item('АКМ', 'weapon');
  ids.kunitsa = item('Куница', 'armor');

  upsertOwned(db, { characterId, itemId: ids.nervyak, kind: 'artifact', level: 15, qty: 3, displayName: 'Нервяк' });
  const containerId = upsertOwned(db, {
    characterId,
    itemId: ids.backpack,
    kind: 'container',
    level: 0,
    qty: 1,
    displayName: 'Рюкзак',
  });
  replaceContainerSlots(
    db,
    containerId,
    [
      { itemId: ids.nervyak, level: 15 },
      { itemId: ids.korka, level: 10 },
    ],
    '2026-01-01T00:00:00.000Z',
  );
  upsertOwned(db, { characterId, itemId: ids.korka, kind: 'artifact', level: 10, qty: 1 });
  upsertOwned(db, { characterId, itemId: ids.ak12, kind: 'weapon', level: 15, qty: 1 });
  upsertOwned(db, { characterId, itemId: ids.akm, kind: 'weapon', level: 5, qty: 1 });
  upsertOwned(db, { characterId, itemId: ids.kunitsa, kind: 'armor', level: 10, qty: 1 });

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
    db.prepare(`DELETE FROM owned_item`).run();
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

  it('clears inventory and rollback restores rows and container slots', () => {
    const slotsBefore = db.prepare(`SELECT * FROM container_slot`).all();
    expect(slotsBefore).toHaveLength(2);

    const result = clearOwned(db, false);
    expect(listOwned(db, characterId)).toHaveLength(0);
    expect(db.prepare(`SELECT COUNT(*) AS c FROM container_slot`).get()).toEqual({ c: 0 });
    const event = listEvents(db)[0]!;
    expect(event).toMatchObject({ action: 'owned.clear', entity: 'owned', entity_id: 'all' });

    rollbackEvent(db, result.eventId!, false);
    expect(listOwned(db, characterId)).toHaveLength(6);
    expect(db.prepare(`SELECT * FROM container_slot`).all()).toHaveLength(slotsBefore.length);
  });

  it('clears builds and rollback restores metrics and slots', () => {
    const result = clearBuilds(db, false);
    expect(listBuilds(db)).toHaveLength(0);
    expect(listEvents(db)[0]).toMatchObject({ action: 'build.clear', entity: 'build' });

    rollbackEvent(db, result.eventId!, false);
    expect(listBuilds(db)).toHaveLength(2);
    const restored = listBuilds(db)[0]!;
    expect(allBuildSlots(db)[restored.id]?.length).toBeGreaterThan(0);
    expect(listBuildMetrics(db, restored.id)).toHaveLength(1);
  });

  it('stores build metrics and rolls a cleared dossier back', () => {
    const result = clearAll(db, false);
    expect(listOwned(db, characterId)).toHaveLength(0);
    expect(listBuilds(db)).toHaveLength(0);
    expect(listEvents(db)[0]).toMatchObject({ action: 'dossier.clear', entity: 'dossier' });

    rollbackEvent(db, result.eventId!, false);
    expect(listOwned(db, characterId)).toHaveLength(6);
    expect(listBuilds(db)).toHaveLength(2);
    expect(listBuildMetrics(db, listBuilds(db)[0]!.id)).toHaveLength(1);
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
