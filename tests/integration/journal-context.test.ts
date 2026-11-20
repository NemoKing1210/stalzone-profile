import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CharacterCreateSchema, CharacterPatchSchema, EventReadSchema } from '@profile/shared';
import {
  clearJournal,
  closeDb,
  createCharacter,
  eventCount,
  getCharacter,
  getEvent,
  listEvents,
  logEvent,
  migrate,
  openDb,
  patchCharacter,
  rollbackEvent,
  runWithEventContext,
  summarizeEvent,
  type Db,
} from '@profile/core';
import { eventJson } from '../../server/utils/serialize';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
const NOW = '2026-01-01T00:00:00.000Z';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-journal-context-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('journal context', () => {
  it('reads the request id and origin from the ambient write context', () => {
    const id = runWithEventContext({ requestId: 'req-http-1', origin: 'http' }, () =>
      logEvent(db, {
        actor: 'owner',
        action: 'inventory.item.update',
        entity: 'inventory',
        entityId: 7,
        before: { level: 3 },
        after: { level: 4 },
      }),
    );

    const row = getEvent(db, id)!;
    expect(row).toMatchObject({ request_id: 'req-http-1', origin: 'http' });
    expect(JSON.parse(row.summary!)).toEqual({ kind: 'update', fields: ['level'] });
    expect(EventReadSchema.parse(eventJson(row))).toMatchObject({
      requestId: 'req-http-1',
      origin: 'http',
      summary: { kind: 'update', fields: ['level'] },
    });
  });

  it('stores NULL context outside a request and lets explicit input win', () => {
    const plain = logEvent(db, { actor: 'owner', action: 'test.event', entity: 'test' });
    expect(getEvent(db, plain)).toMatchObject({ request_id: null, origin: null });

    const explicit = runWithEventContext({ requestId: 'ambient', origin: 'http' }, () =>
      logEvent(db, {
        actor: 'owner',
        action: 'test.event',
        requestId: 'explicit',
        origin: 'cli',
      }),
    );
    expect(getEvent(db, explicit)).toMatchObject({ request_id: 'explicit', origin: 'cli' });
  });

  it('derives the coarse summary kinds from the snapshot pair', () => {
    expect(summarizeEvent('character.create', null, { nick: 'Owner' })).toEqual({
      kind: 'create',
      fields: ['nick'],
    });
    expect(summarizeEvent('inventory.item.delete', { level: 3 }, null)).toEqual({
      kind: 'delete',
      fields: ['level'],
    });
    expect(summarizeEvent('journal.clear', { count: 2, events: [] }, null)).toEqual({
      kind: 'clear',
      fields: ['count', 'events'],
    });
    expect(summarizeEvent('character.update', { a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({
      kind: 'update',
      fields: ['b'],
    });
  });
});

describe('service writes carry the context without touching before/after', () => {
  it('records context on create, update and rollback while the snapshots stay a rollback record', () => {
    runWithEventContext({ requestId: 'req-create', origin: 'api' }, () =>
      createCharacter(db, CharacterCreateSchema.parse({ nick: 'Tester', region: 'ru' })),
    );
    const created = listEvents(db)[0]!;
    expect(created).toMatchObject({ action: 'character.create', request_id: 'req-create', origin: 'api' });
    expect(Object.keys(JSON.parse(created.after!))).toEqual([
      'id',
      'nick',
      'region',
      'faction',
      'alliance',
      'clanName',
      'clanRank',
      'money',
      'maxMoney',
      'profileFetchedAt',
      'stats',
      'manualStats',
    ]);

    runWithEventContext({ requestId: 'req-update', origin: 'http' }, () =>
      patchCharacter(db, CharacterPatchSchema.parse({ nick: 'Renamed' })),
    );
    const updated = listEvents(db)[0]!;
    expect(updated).toMatchObject({ action: 'character.update', request_id: 'req-update', origin: 'http' });
    expect(JSON.parse(updated.before!)).toMatchObject({ nick: 'Tester' });
    expect(JSON.parse(updated.after!)).toMatchObject({ nick: 'Renamed' });
    expect(JSON.parse(updated.summary!)).toEqual({ kind: 'update', fields: ['nick'] });

    const result = rollbackEvent(db, updated.id, false);
    expect(getCharacter(db)?.nick).toBe('Tester');

    const rollback = getEvent(db, result.eventId!)!;
    expect(rollback).toMatchObject({ action: 'rollback', request_id: null, origin: null });
    expect(JSON.parse(rollback.before!)).toMatchObject({ nick: 'Renamed' });
    expect(JSON.parse(rollback.after!)).toMatchObject({ nick: 'Tester' });
    expect(JSON.parse(rollback.summary!)).toMatchObject({ kind: 'rollback', fields: ['nick'] });
  });
});

describe('journal clear and rollback', () => {
  it('restores each event with its request context and summary', () => {
    const first = runWithEventContext({ requestId: 'req-a', origin: 'http' }, () =>
      logEvent(db, { actor: 'owner', action: 'inventory.item.create', entity: 'inventory', entityId: 1, after: { id: 1 } }),
    );
    const second = logEvent(db, { actor: 'owner', action: 'test.event', entity: 'test' });

    const cleared = runWithEventContext({ requestId: 'req-clear', origin: 'http' }, () => clearJournal(db, false));
    expect(getEvent(db, cleared.eventId!)).toMatchObject({ action: 'journal.clear', request_id: 'req-clear' });
    expect(eventCount(db)).toBe(1);

    rollbackEvent(db, cleared.eventId!, false);

    expect(getEvent(db, first)).toMatchObject({
      action: 'inventory.item.create',
      request_id: 'req-a',
      origin: 'http',
      summary: '{"kind":"create","fields":["id"]}',
    });
    expect(getEvent(db, second)).toMatchObject({ request_id: null, origin: null });
    expect(listEvents(db)[0]).toMatchObject({ action: 'rollback' });
  });

  it('restores a snapshot written before the context columns existed', () => {
    const legacy = {
      id: 500,
      at: NOW,
      actor: 'owner',
      action: 'inventory.item.create',
      entity: 'inventory',
      entity_id: '1',
      before: null,
      after: '{"id":1}',
      note: null,
    };
    const clearId = logEvent(db, {
      actor: 'owner',
      action: 'journal.clear',
      entity: 'journal',
      entityId: 'all',
      before: { count: 1, events: [legacy] },
      after: null,
    });

    expect(() => rollbackEvent(db, clearId, false)).not.toThrow();

    const restored = getEvent(db, 500)!;
    expect(restored).toMatchObject({
      action: 'inventory.item.create',
      before: null,
      after: '{"id":1}',
      request_id: null,
      origin: null,
      summary: null,
    });
    expect(EventReadSchema.parse(eventJson(restored)).summary).toEqual({ kind: 'create', fields: ['id'] });
  });
});
