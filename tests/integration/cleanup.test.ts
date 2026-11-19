import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupCounts,
  clearByScope,
  clearInventory,
  clearJournal,
  clearManualStats,
  closeDb,
  deleteCharacterProfile,
  eventCount,
  getCharacter,
  inventoryCounts,
  listCharacterStats,
  listEvents,
  logEvent,
  migrate,
  openDb,
  resetAll,
  rollbackEvent,
  WriteError,
  type Db,
} from '@profile/core';
import { setCharacterStat, upsertCharacter } from '@profile/core/testing';
import { seedInventory } from '../fixtures/inventory';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

let dir: string;
let db: Db;
let characterId: number;

/** The fixture: 8 instances, three storages (inventory, intake, stash) and 8 placements. */
const SEEDED = { items: 8, storages: 3, placements: 8 } as const;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-cleanup-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  characterId = seedInventory(db).characterId;
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('cleanup counts', () => {
  it('counts every scope', () => {
    setCharacterStat(db, characterId, 'kil', 12, 'manual');
    setCharacterStat(db, characterId, 'dea', 4, 'api');
    logEvent(db, { actor: 'owner', action: 'test.event', entity: 'test' });
    expect(cleanupCounts(db)).toEqual({
      inventory: SEEDED,
      manualStats: { records: 1 },
      character: { present: true, nick: 'inventory-fixture' },
      journal: { events: 1 },
    });
  });

  it('returns zero counts when there is no character', () => {
    db.prepare(`DELETE FROM character`).run();
    expect(cleanupCounts(db)).toEqual({
      inventory: { items: 0, storages: 0, placements: 0 },
      manualStats: { records: 0 },
      character: { present: false, nick: null },
      journal: { events: 0 },
    });
  });
});

describe('cleanup writes', () => {
  it('dry-runs inventory cleanup without writing rows or events', () => {
    const eventsBefore = listEvents(db).length;
    const result = clearInventory(db, true);
    expect(result).toMatchObject({ dryRun: true, diff: { after: null } });
    expect(result.eventId).toBeUndefined();
    expect(result.diff.human).toBe('Inventory cleared: 8 items, 3 storages');
    expect((result.diff.before as { items: unknown[] }).items).toHaveLength(8);
    expect(inventoryCounts(db, characterId)).toEqual(SEEDED);
    expect(listEvents(db)).toHaveLength(eventsBefore);
  });

  it('clears the inventory, recreates the default storage and rolls back exactly', () => {
    const before = clearInventory(db, true).diff.before;

    const result = clearInventory(db, false);
    expect(inventoryCounts(db, characterId)).toEqual({ items: 0, storages: 2, placements: 0 });
    expect(listEvents(db)[0]).toMatchObject({ action: 'inventory.clear', entity: 'inventory', entity_id: 'all' });

    rollbackEvent(db, result.eventId!, false);
    expect(inventoryCounts(db, characterId)).toEqual(SEEDED);
    expect(clearInventory(db, true).diff.before).toEqual(before);
  });

  it('rejects an empty scope without writing', () => {
    clearInventory(db, false);
    const eventsBefore = listEvents(db).length;
    expect(() => clearInventory(db, false)).toThrowError(WriteError);
    expect(listEvents(db)).toHaveLength(eventsBefore);
  });

  it('refuses to roll back a legacy owned event instead of failing halfway', () => {
    const eventId = logEvent(db, {
      actor: 'owner',
      action: 'owned.clear',
      entity: 'owned',
      entityId: 'all',
      before: { owned: [{ id: 1 }] },
      after: null,
    });
    const eventsBefore = listEvents(db).length;

    try {
      rollbackEvent(db, eventId, false);
      throw new Error('expected WriteError');
    } catch (error) {
      expect(error).toBeInstanceOf(WriteError);
      expect((error as WriteError).code).toBe('EVENT_NOT_ROLLBACKABLE');
    }
    expect(listEvents(db)).toHaveLength(eventsBefore);
    expect(inventoryCounts(db, characterId)).toEqual(SEEDED);
  });

  it('rollback fails rather than partially restores without a character', () => {
    const result = clearInventory(db, false);
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
    expect(clearByScope(db, 'inventory', true).diff.human).toBe('Inventory cleared: 8 items, 3 storages');
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
    expect(inventoryCounts(db, characterId)).toEqual(SEEDED);
    expect(db.prepare(`SELECT COUNT(*) AS c FROM character_stat`).get()).toEqual({ c: 3 });
    expect(eventCount(db)).toBe(0);
  });

  it('deletes the character, its inventory and stats with one event', () => {
    const result = deleteCharacterProfile(db, false);

    expect(getCharacter(db)).toBeNull();
    expect(db.prepare(`SELECT COUNT(*) AS c FROM inventory_item`).get()).toEqual({ c: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS c FROM item_placement`).get()).toEqual({ c: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS c FROM storage`).get()).toEqual({ c: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS c FROM character_stat`).get()).toEqual({ c: 0 });
    expect(result.eventId).toBeDefined();
    expect(listEvents(db)[0]).toMatchObject({
      action: 'character.delete',
      entity: 'character',
      entity_id: String(characterId),
    });
  });

  it('rollback restores identity, both stat origins, instances, storages and placements', () => {
    const statsBefore = listCharacterStats(db, characterId);
    const inventoryBefore = clearInventory(db, true).diff.before;
    const result = deleteCharacterProfile(db, false);

    rollbackEvent(db, result.eventId!, false);

    expect(getCharacter(db)).toMatchObject({ id: characterId, nick: 'inventory-fixture', region: 'ru' });
    expect(listCharacterStats(db, characterId)).toEqual(statsBefore);
    expect(inventoryCounts(db, characterId)).toEqual(SEEDED);
    expect(clearInventory(db, true).diff.before).toEqual(inventoryBefore);
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
    logEvent(db, { actor: 'owner', action: 'inventory.item.create', entity: 'inventory', entityId: 1, before: null, after: { id: 1 } });
    logEvent(db, {
      actor: 'owner',
      action: 'inventory.item.update',
      entity: 'inventory',
      entityId: 1,
      before: { id: 1 },
      after: { id: 1, qty: 2 },
    });
    logEvent(db, {
      actor: 'owner',
      action: 'character.update',
      entity: 'character',
      entityId: characterId,
      before: { nick: 'inventory-fixture' },
      after: { nick: 'inventory-fixture' },
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
    logEvent(db, { actor: 'owner', action: 'inventory.item.create', entity: 'inventory', entityId: 1, before: null, after: { id: 1 } });
    logEvent(db, { actor: 'owner', action: 'character.update', entity: 'character', entityId: characterId, before: {}, after: {} });
  }

  it('dry-runs without deleting the profile or the journal', () => {
    setCharacterStat(db, characterId, 'kil', 12, 'manual');
    seedEvents();
    const result = resetAll(db, true);

    expect(result).toMatchObject({ dryRun: true, diff: { after: null } });
    expect(getCharacter(db)?.id).toBe(characterId);
    expect(eventCount(db)).toBe(2);
    expect(inventoryCounts(db, characterId)).toEqual(SEEDED);
  });

  it('clears the character and the journal, and rollback restores both', () => {
    setCharacterStat(db, characterId, 'kil', 12, 'manual');
    setCharacterStat(db, characterId, 'dea', 3, 'api');
    seedEvents();
    const statsBefore = listCharacterStats(db, characterId);
    const eventsBefore = db
      .prepare(`SELECT id, at, actor, action, entity, entity_id, before, after, note FROM event_log ORDER BY id`)
      .all();
    const result = resetAll(db, false);

    expect(getCharacter(db)).toBeNull();
    expect(db.prepare(`SELECT COUNT(*) AS c FROM inventory_item`).get()).toEqual({ c: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS c FROM character_stat`).get()).toEqual({ c: 0 });
    expect(eventCount(db)).toBe(1);
    expect(listEvents(db)[0]).toMatchObject({ action: 'reset.all', entity: 'profile', entity_id: 'all' });

    rollbackEvent(db, result.eventId!, false);

    expect(getCharacter(db)).toMatchObject({ id: characterId, nick: 'inventory-fixture', region: 'ru' });
    expect(inventoryCounts(db, characterId)).toEqual(SEEDED);
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
    db.prepare(`DELETE FROM character`).run();
    expect(() => resetAll(db, false)).toThrowError(WriteError);
  });
});
