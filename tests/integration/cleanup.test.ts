import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupCounts,
  clearByScope,
  clearJournal,
  clearManualStats,
  clearOwned,
  closeDb,
  deleteCharacterProfile,
  ensureDefaultSources,
  eventCount,
  getCharacter,
  listCharacterStats,
  listEvents,
  listOwned,
  logEvent,
  migrate,
  openDb,
  resetAll,
  rollbackEvent,
  WriteError,
  type Db,
} from '@profile/core';
import {
  replaceContainerSlots,
  setCharacterStat,
  upsertCharacter,
  upsertItem,
  upsertOwned,
} from '@profile/core/testing';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

let dir: string;
let db: Db;
let characterId: number;
const ids: Record<string, number> = {};

function item(name: string, kind: string): number {
  return upsertItem(db, { sourceId: 'local', externalId: `test:${kind}:${name}`, name, kind });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-cleanup-'));
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
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('cleanup counts', () => {
  it('counts every scope and sums qty separately from rows', () => {
    setCharacterStat(db, characterId, 'kil', 12, 'manual');
    setCharacterStat(db, characterId, 'dea', 4, 'api');
    logEvent(db, { actor: 'owner', action: 'test.event', entity: 'test' });
    expect(cleanupCounts(db)).toEqual({
      owned: { records: 6, copies: 8 },
      manualStats: { records: 1 },
      character: { present: true, nick: 'tester' },
      journal: { events: 1 },
    });
  });

  it('returns zero counts when there is no character', () => {
    db.prepare(`DELETE FROM owned_item`).run();
    db.prepare(`DELETE FROM character`).run();
    expect(cleanupCounts(db)).toEqual({
      owned: { records: 0, copies: 0 },
      manualStats: { records: 0 },
      character: { present: false, nick: null },
      journal: { events: 0 },
    });
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

  it('rolls back the inventory part of a legacy profile.clear snapshot', () => {
    const before = clearOwned(db, true).diff.before as unknown[];
    db.prepare(`DELETE FROM owned_item`).run();
    const eventId = logEvent(db, {
      actor: 'owner',
      action: 'profile.clear',
      entity: 'profile',
      entityId: 'all',
      before: { owned: before, builds: [] },
      after: null,
    });

    rollbackEvent(db, eventId, false);
    expect(listOwned(db, characterId)).toHaveLength(6);
  });

  it('rolls back the inventory part of a legacy dossier.clear snapshot', () => {
    const before = clearOwned(db, true).diff.before as unknown[];
    db.prepare(`DELETE FROM owned_item`).run();
    const eventId = logEvent(db, {
      actor: 'owner',
      action: 'dossier.clear',
      entity: 'dossier',
      entityId: 'all',
      before: { owned: before, builds: [] },
      after: null,
    });

    rollbackEvent(db, eventId, false);
    expect(listOwned(db, characterId)).toHaveLength(6);
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

describe('cleanup dispatcher', () => {
  it('routes a scope to the matching reset', () => {
    expect(clearByScope(db, 'inventory', true).diff.human).toBe('Inventory cleared: 6 records, 8 copies');
    setCharacterStat(db, characterId, 'kil', 1, 'manual');
    expect(clearByScope(db, 'manualStats', true).diff.human).toBe('Manual stats cleared: 1 value');
  });
});

describe('manual stat cleanup', () => {
  beforeEach(() => {
    setCharacterStat(db, characterId, 'kil', 12, 'manual');
    setCharacterStat(db, characterId, 'kil', 7, 'api');
    setCharacterStat(db, characterId, 'dea', 3, 'manual');
  });

  it('dry-runs without writing rows or events', () => {
    const statsBefore = listCharacterStats(db, characterId);
    const eventsBefore = eventCount(db);
    const result = clearManualStats(db, true);

    expect(result).toMatchObject({ dryRun: true, diff: { after: null } });
    expect(result.eventId).toBeUndefined();
    expect(result.diff.human).toBe('Manual stats cleared: 2 values');
    expect(listCharacterStats(db, characterId)).toEqual(statsBefore);
    expect(eventCount(db)).toBe(eventsBefore);
  });

  it('removes only manual rows and rollback restores them', () => {
    const statsBefore = listCharacterStats(db, characterId);
    const result = clearManualStats(db, false);

    expect(listCharacterStats(db, characterId)).toEqual([
      expect.objectContaining({ stat_id: 'kil', origin: 'api', value_num: 7 }),
    ]);
    expect(listEvents(db)[0]).toMatchObject({ action: 'character.stats.clear', entity: 'character' });

    rollbackEvent(db, result.eventId!, false);
    expect(listCharacterStats(db, characterId)).toEqual(statsBefore);
  });

  it('rejects a scope with no manual stats', () => {
    clearManualStats(db, false);
    const eventsBefore = eventCount(db);
    expect(() => clearManualStats(db, false)).toThrowError(WriteError);
    expect(eventCount(db)).toBe(eventsBefore);
  });
});

describe('character reset', () => {
  beforeEach(() => {
    setCharacterStat(db, characterId, 'kil', 12, 'manual');
    setCharacterStat(db, characterId, 'kil', 7, 'api');
    setCharacterStat(db, characterId, 'dea', 3, 'api');
  });

  it('dry-runs without deleting the character, gear or stats', () => {
    const result = deleteCharacterProfile(db, true);

    expect(result).toMatchObject({ dryRun: true });
    expect(result.eventId).toBeUndefined();
    expect(getCharacter(db)?.id).toBe(characterId);
    expect(db.prepare(`SELECT COUNT(*) AS c FROM owned_item`).get()).toEqual({ c: 6 });
    expect(db.prepare(`SELECT COUNT(*) AS c FROM character_stat`).get()).toEqual({ c: 3 });
    expect(eventCount(db)).toBe(0);
  });

  it('deletes the character, owned rows and stats with one event', () => {
    const result = deleteCharacterProfile(db, false);

    expect(getCharacter(db)).toBeNull();
    expect(db.prepare(`SELECT COUNT(*) AS c FROM owned_item`).get()).toEqual({ c: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS c FROM container_slot`).get()).toEqual({ c: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS c FROM character_stat`).get()).toEqual({ c: 0 });
    expect(result.eventId).toBeDefined();
    expect(listEvents(db)[0]).toMatchObject({
      action: 'character.delete',
      entity: 'character',
      entity_id: String(characterId),
    });
  });

  it('rollback restores identity, both stat origins, owned rows and container fills', () => {
    const statsBefore = listCharacterStats(db, characterId);
    const slotsBefore = db.prepare(`SELECT * FROM container_slot ORDER BY container_owned_id, slot`).all();
    const result = deleteCharacterProfile(db, false);

    rollbackEvent(db, result.eventId!, false);

    expect(getCharacter(db)).toMatchObject({ id: characterId, nick: 'tester', region: 'ru' });
    expect(listCharacterStats(db, characterId)).toEqual(statsBefore);
    expect(listOwned(db, characterId)).toHaveLength(6);
    expect(db.prepare(`SELECT * FROM container_slot ORDER BY container_owned_id, slot`).all()).toHaveLength(
      slotsBefore.length,
    );
  });

  it('refuses to roll back over a character created after the reset', () => {
    const result = deleteCharacterProfile(db, false);
    upsertCharacter(db, { nick: 'other', region: 'eu' });

    try {
      rollbackEvent(db, result.eventId!, false);
      throw new Error('expected WriteError');
    } catch (error) {
      expect(error).toBeInstanceOf(WriteError);
      expect((error as WriteError).code).toBe('CHARACTER_EXISTS');
    }
    expect(getCharacter(db)).toMatchObject({ nick: 'other', region: 'eu' });
  });

  it('rejects a profile with no character', () => {
    db.prepare(`DELETE FROM owned_item`).run();
    db.prepare(`DELETE FROM character`).run();
    try {
      deleteCharacterProfile(db, false);
      throw new Error('expected WriteError');
    } catch (error) {
      expect(error).toBeInstanceOf(WriteError);
      expect((error as WriteError).code).toBe('NO_CHARACTER');
    }
  });
});

describe('journal reset', () => {
  function seedEvents(): void {
    logEvent(db, { actor: 'owner', action: 'owned.create', entity: 'owned', entityId: 1, before: null, after: { id: 1 } });
    logEvent(db, {
      actor: 'owner',
      action: 'owned.update',
      entity: 'owned',
      entityId: 1,
      before: { id: 1 },
      after: { id: 1, qty: 2 },
    });
    logEvent(db, {
      actor: 'owner',
      action: 'character.update',
      entity: 'character',
      entityId: characterId,
      before: { nick: 'tester' },
      after: { nick: 'tester' },
    });
  }

  function eventsWithoutRollback(): unknown[] {
    return db
      .prepare(
        `SELECT id, at, actor, action, entity, entity_id, before, after, note
         FROM event_log WHERE action != 'rollback' ORDER BY id`,
      )
      .all();
  }

  it('dry-runs without deleting events', () => {
    seedEvents();
    const result = clearJournal(db, true);

    expect(result).toMatchObject({ dryRun: true, diff: { after: null } });
    expect(result.eventId).toBeUndefined();
    expect(eventCount(db)).toBe(3);
  });

  it('clears the journal, leaves one event and rollback restores the exact rows', () => {
    seedEvents();
    const before = eventsWithoutRollback();
    const result = clearJournal(db, false);

    expect(eventCount(db)).toBe(1);
    expect(listEvents(db)[0]).toMatchObject({ action: 'journal.clear', entity: 'journal', entity_id: 'all' });

    rollbackEvent(db, result.eventId!, false);

    expect(eventsWithoutRollback()).toEqual(before);
    expect(listEvents(db)[0]).toMatchObject({ action: 'rollback' });
  });

  it('rejects an empty journal', () => {
    expect(() => clearJournal(db, false)).toThrowError(WriteError);
  });
});

describe('full reset', () => {
  function seedEvents(): void {
    logEvent(db, { actor: 'owner', action: 'owned.create', entity: 'owned', entityId: 1, before: null, after: { id: 1 } });
    logEvent(db, { actor: 'owner', action: 'character.update', entity: 'character', entityId: characterId, before: {}, after: {} });
  }

  it('dry-runs without deleting the profile or the journal', () => {
    setCharacterStat(db, characterId, 'kil', 12, 'manual');
    seedEvents();
    const result = resetAll(db, true);

    expect(result).toMatchObject({ dryRun: true, diff: { after: null } });
    expect(getCharacter(db)?.id).toBe(characterId);
    expect(eventCount(db)).toBe(2);
    expect(db.prepare(`SELECT COUNT(*) AS c FROM owned_item`).get()).toEqual({ c: 6 });
  });

  it('clears the character and the journal, and rollback restores both', () => {
    setCharacterStat(db, characterId, 'kil', 12, 'manual');
    setCharacterStat(db, characterId, 'dea', 3, 'api');
    seedEvents();
    const statsBefore = listCharacterStats(db, characterId);
    const eventsBefore = db.prepare(`SELECT id, at, actor, action, entity, entity_id, before, after, note FROM event_log ORDER BY id`).all();
    const result = resetAll(db, false);

    expect(getCharacter(db)).toBeNull();
    expect(db.prepare(`SELECT COUNT(*) AS c FROM owned_item`).get()).toEqual({ c: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS c FROM character_stat`).get()).toEqual({ c: 0 });
    expect(eventCount(db)).toBe(1);
    expect(listEvents(db)[0]).toMatchObject({ action: 'reset.all', entity: 'profile', entity_id: 'all' });

    rollbackEvent(db, result.eventId!, false);

    expect(getCharacter(db)).toMatchObject({ id: characterId, nick: 'tester', region: 'ru' });
    expect(listOwned(db, characterId)).toHaveLength(6);
    expect(listCharacterStats(db, characterId)).toEqual(statsBefore);
    expect(
      db
        .prepare(
          `SELECT id, at, actor, action, entity, entity_id, before, after, note
           FROM event_log WHERE action != 'rollback' ORDER BY id`,
        )
        .all(),
    ).toEqual(eventsBefore);
  });

  it('rejects an empty profile and journal', () => {
    db.prepare(`DELETE FROM owned_item`).run();
    db.prepare(`DELETE FROM character`).run();
    expect(() => resetAll(db, false)).toThrowError(WriteError);
  });
});
