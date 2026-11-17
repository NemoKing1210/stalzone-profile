import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  ensureDefaultSources,
  listEvents,
  listSources,
  migrate,
  openDb,
  readSyncSchedule,
  rollbackEvent,
  setSyncSchedule,
  syncDiagnostics,
  type Db,
} from '@profile/core';
import { writeSyncScheduleRow } from '@profile/core/modules/sync';
import { seedCatalog } from '../fixtures/seed';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-schedule-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('sync schedule storage', () => {
  it('creates one disabled row with the documented defaults', () => {
    expect(readSyncSchedule(db)).toEqual({
      enabled: false,
      catalogEveryMin: 360,
      pricesEveryMin: 60,
      profileEveryMin: 0,
      updatedAt: expect.any(String),
    });
  });

  it('falls back to defaults when the row is missing', () => {
    db.prepare('DELETE FROM sync_schedule').run();
    expect(readSyncSchedule(db)).toMatchObject({ enabled: false, catalogEveryMin: 360, pricesEveryMin: 60 });
  });

  it('updates the single row in place', () => {
    writeSyncScheduleRow(db, { enabled: true, catalogEveryMin: 15, pricesEveryMin: 0, profileEveryMin: 1440 });
    expect(readSyncSchedule(db)).toMatchObject({
      enabled: true,
      catalogEveryMin: 15,
      pricesEveryMin: 0,
      profileEveryMin: 1440,
    });
    expect((db.prepare('SELECT COUNT(*) AS c FROM sync_schedule').get() as { c: number }).c).toBe(1);
  });

  it('fills the public origin URL for every source and leaves local empty', () => {
    const rows = listSources(db);
    expect(rows.find((row) => row.id === 'exbo_base')?.url).toBe(
      'https://github.com/EXBO-Studio/stalzone-database',
    );
    expect(rows.find((row) => row.id === 'local')?.url).toBeNull();
  });
});

describe('sync diagnostics', () => {
  it('describes every source with kind, url and honest counts', () => {
    seedCatalog(db);
    const diagnostics = syncDiagnostics(db, { profileApiConfigured: false });
    expect(diagnostics.schedule.enabled).toBe(false);
    expect(diagnostics.profileApiConfigured).toBe(false);
    expect(diagnostics.catalogItems).toBeGreaterThan(0);
    expect(diagnostics.sources.map((source) => source.id)).toEqual([
      'exbo_base',
      'wiki',
      'scpmodel',
      'motifs',
      'icons',
      'profile',
      'local',
    ]);
    expect(diagnostics.sources.find((source) => source.id === 'exbo_base')!.url).toContain('github.com');
    expect(diagnostics.sources.find((source) => source.id === 'local')!.url).toBeNull();
    for (const source of diagnostics.sources) {
      if (['scpmodel', 'icons', 'profile'].includes(source.id)) expect(typeof source.records).toBe('number');
      else expect(source.records).toBeNull();
    }
  });

  it('returns null for the profile count without a character', () => {
    seedCatalog(db);
    db.prepare('DELETE FROM character_stat').run();
    db.prepare('DELETE FROM character').run();
    const diagnostics = syncDiagnostics(db, { profileApiConfigured: true });
    for (const id of ['profile', 'exbo_base', 'wiki', 'motifs', 'local']) {
      expect(diagnostics.sources.find((source) => source.id === id)!.records).toBeNull();
    }
  });

  it('reports ready profile only when credentials and a supported character exist', () => {
    const blocked = syncDiagnostics(db, { profileApiConfigured: false });
    expect(blocked.bundles.find((bundle) => bundle.id === 'profile')!.ready).toBe(false);
  });
});

const next = { enabled: true, catalogEveryMin: 120, pricesEveryMin: 30, profileEveryMin: 0 };

describe('sync schedule writes', () => {
  it('dry-runs without writing a row or an event', () => {
    const before = readSyncSchedule(db);
    const events = listEvents(db).length;
    const result = setSyncSchedule(db, { ...next, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.eventId).toBeUndefined();
    expect(result.diff.human).toBe('Auto-sync enabled: catalog 120 min, prices 30 min, profile off');
    expect(readSyncSchedule(db)).toEqual(before);
    expect(listEvents(db)).toHaveLength(events);
  });

  it('writes the schedule with a before/after event and rolls it back', () => {
    const before = readSyncSchedule(db);
    const result = setSyncSchedule(db, { ...next, dryRun: false });
    expect(result.eventId).toBeTypeOf('number');
    expect(readSyncSchedule(db)).toMatchObject(next);

    const event = listEvents(db)[0]!;
    expect(event.action).toBe('sync.schedule.update');
    expect(event.entity).toBe('sync_schedule');
    expect(JSON.parse(event.before!)).toEqual({
      enabled: before.enabled,
      catalogEveryMin: before.catalogEveryMin,
      pricesEveryMin: before.pricesEveryMin,
      profileEveryMin: before.profileEveryMin,
    });

    rollbackEvent(db, result.eventId!, false);
    expect(readSyncSchedule(db)).toMatchObject({
      enabled: before.enabled,
      catalogEveryMin: before.catalogEveryMin,
      pricesEveryMin: before.pricesEveryMin,
      profileEveryMin: before.profileEveryMin,
    });
  });

  it('rejects an interval below the floor with a domain error', () => {
    expect(() => setSyncSchedule(db, { ...next, catalogEveryMin: 5, dryRun: false })).toThrowError(
      expect.objectContaining({ status: 422, code: 'INVALID_SCHEDULE' }),
    );
  });

  it('does not log an event for a no-op', () => {
    const events = listEvents(db).length;
    const current = readSyncSchedule(db);
    const result = setSyncSchedule(db, {
      enabled: current.enabled,
      catalogEveryMin: current.catalogEveryMin,
      pricesEveryMin: current.pricesEveryMin,
      profileEveryMin: current.profileEveryMin,
      dryRun: false,
    });
    expect(result.eventId).toBeUndefined();
    expect(listEvents(db)).toHaveLength(events);
  });
});
