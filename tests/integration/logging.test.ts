import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LoggingSettingsUpdate } from '@profile/shared/contracts';
import { attachCliLogging, flushCliLogging } from '../../scripts/cli-runtime';
import {
  closeDb,
  enqueueLog,
  flushLogs,
  getLogger,
  ingestClientLogs,
  invalidateLoggingSettings,
  logStats,
  migrate,
  openDb,
  purgeLogs,
  queryLogs,
  readEffectiveLogging,
  readLoggingSettings,
  resetLoggingForTests,
  rollbackEvent,
  runSync,
  runRetention,
  tableExists,
  updateLoggingSettings,
  type Db,
} from '@profile/core';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-logging-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
});

afterEach(() => {
  resetLoggingForTests();
  if (db.open) closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('logging schema', () => {
  it('creates the logging tables and seeds one settings row', () => {
    for (const name of ['log_entry', 'log_level', 'log_setting']) {
      expect(tableExists(db, name), name).toBe(true);
    }
    const row = db.prepare(`SELECT * FROM log_setting`).get() as Record<string, unknown>;
    expect(row).toMatchObject({
      id: 1,
      enabled: 1,
      min_level: 'info',
      retention_days: 14,
      max_rows: 200000,
      capture_client: 1,
      client_console: 0,
      mirror_stdout: 1,
    });
    expect(db.prepare(`SELECT COUNT(*) AS c FROM log_level`).get()).toEqual({ c: 0 });
  });

  it('reads the seeded settings and caches them per database', () => {
    const first = readEffectiveLogging(db);
    expect(first).toMatchObject({ enabled: true, minLevel: 'info', retentionDays: 14, maxRows: 200000 });
    expect(first.levels).toEqual({
      http: 'info',
      sync: 'info',
      mcp: 'info',
      db: 'info',
      app: 'info',
      client: 'info',
    });
    db.prepare(`UPDATE log_setting SET min_level = 'warn' WHERE id = 1`).run();
    expect(readEffectiveLogging(db).minLevel).toBe('info');
    invalidateLoggingSettings(db);
    expect(readEffectiveLogging(db).minLevel).toBe('warn');
  });
});

function count(): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM log_entry`).get() as { c: number }).c;
}

function settingsInput(overrides: Partial<LoggingSettingsUpdate> = {}): LoggingSettingsUpdate {
  return {
    enabled: true,
    minLevel: 'info',
    retentionDays: 14,
    maxRows: 200000,
    captureClient: true,
    clientConsole: false,
    mirrorStdout: true,
    levels: { http: 'inherit', sync: 'debug', mcp: 'inherit', db: 'inherit', app: 'inherit', client: 'off' },
    ...overrides,
  };
}

describe('logging settings', () => {
  it('returns effective and override levels', () => {
    const view = readLoggingSettings(db);
    expect(view.levels.sync).toBe('info');
    expect(view.overrides).toEqual({});
  });

  it('writes settings, invalidates the cache and records an audit event', () => {
    const result = updateLoggingSettings(db, settingsInput());
    expect(result.dryRun).toBe(false);
    expect(result.eventId).toBeTypeOf('number');
    const event = db.prepare(`SELECT * FROM event_log WHERE id = ?`).get(result.eventId) as Record<string, any>;
    expect(event.action).toBe('logging.settings.update');
    expect(readEffectiveLogging(db).levels.sync).toBe('debug');
    expect(readEffectiveLogging(db).levels.client).toBe('off');
  });

  it('does not change data on dryRun and rejects out-of-range retention', () => {
    const dry = updateLoggingSettings(db, settingsInput({ dryRun: true }));
    expect(dry.dryRun).toBe(true);
    expect(readLoggingSettings(db).minLevel).toBe('info');
    expect(() => updateLoggingSettings(db, settingsInput({ retentionDays: 0 }))).toThrow(/Invalid logging settings/);
  });

  it('rolls the settings write back through the journal', () => {
    const result = updateLoggingSettings(db, settingsInput({ minLevel: 'error' }));
    rollbackEvent(db, result.eventId!, false);
    expect(readLoggingSettings(db).minLevel).toBe('info');
    expect(readLoggingSettings(db).overrides).toEqual({});
  });
});

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

function seedLogs(): void {
  enqueueLog(db, {
    level: 'error',
    category: 'sync',
    message: 'wiki failed',
    context: { source: 'wiki' },
    at: at(60),
    requestId: 'run-1',
  });
  enqueueLog(db, {
    level: 'warn',
    category: 'http',
    message: 'GET /api/v1/items 500',
    context: { path: '/api/v1/items' },
    at: at(30),
    durationMs: 1500,
  });
  enqueueLog(db, {
    level: 'error',
    category: 'sync',
    message: 'wiki failed',
    context: { source: 'wiki' },
    at: at(10),
    requestId: 'run-2',
  });
  enqueueLog(db, { level: 'info', category: 'app', message: 'boot', at: at(5) });
  flushLogs(db);
}

describe('logging reads', () => {
  it('filters and paginates by cursor', () => {
    seedLogs();
    const first = queryLogs(db, { levels: ['warn', 'error'], limit: 2 });
    expect(first.entries.map((entry) => entry.level)).toEqual(['error', 'warn']);
    expect(first.hasMore).toBe(true);
    expect(first.nextBefore).toBe(first.entries[1]!.id);
    const second = queryLogs(db, { levels: ['warn', 'error'], limit: 2, before: first.nextBefore! });
    expect(second.entries.map((entry) => entry.level)).toEqual(['error']);
    expect(second.hasMore).toBe(false);
    expect(second.nextBefore).toBeNull();
  });

  it('filters by category, text, request id and duration', () => {
    seedLogs();
    expect(queryLogs(db, { categories: ['sync'], text: 'failed' }).entries).toHaveLength(2);
    expect(queryLogs(db, { requestId: 'run-2' }).entries).toHaveLength(1);
    expect(queryLogs(db, { minDurationMs: 1000 }).entries).toHaveLength(1);
  });

  it('groups repeats over the whole filtered set, not one page', () => {
    seedLogs();
    const result = queryLogs(db, { limit: 1 });
    const group = result.groups.find((entry) => entry.count === 2);
    expect(group).toMatchObject({ category: 'sync', level: 'error', count: 2, sample: 'wiki failed' });
    expect(result.entries).toHaveLength(1);
  });

  it('reports stats for the window', () => {
    seedLogs();
    const stats = logStats(db, 24);
    expect(stats.byLevel.error).toBe(2);
    expect(stats.byLevel.warn).toBe(1);
    expect(stats.byCategory.sync).toBe(2);
    expect(stats.bySource.server).toBe(4);
    expect(stats.bytes).toBeGreaterThan(0);
  });
});

describe('logging purge and retention', () => {
  it('previews and purges exactly the filtered set, then audits the count', () => {
    seedLogs();
    const before = queryLogs(db, { categories: ['sync'] }).entries.length;
    const dry = purgeLogs(db, { scope: 'filtered', filter: { categories: ['sync'] }, dryRun: true });
    expect(dry.diff.before).toEqual({ count: before, filter: { categories: ['sync'] } });
    expect(queryLogs(db, { categories: ['sync'] }).entries).toHaveLength(before);

    const result = purgeLogs(db, { scope: 'filtered', filter: { categories: ['sync'] } });
    expect(result.dryRun).toBe(false);
    expect(queryLogs(db, { categories: ['sync'] }).entries).toHaveLength(0);
    const event = db.prepare(`SELECT * FROM event_log WHERE id = ?`).get(result.eventId) as any;
    expect(event.action).toBe('log.clear');
    expect(JSON.parse(event.before).count).toBe(before);
  });

  it('rejects a filtered purge with an empty predicate and keeps every row', () => {
    seedLogs();
    const total = queryLogs(db, { limit: 200 }).entries.length;
    // The MCP tool always builds the full key set, so "no filter" arrives as
    // undefined keys rather than a missing object.
    const emptyFilters = [
      { levels: [] },
      { levels: [], categories: [], sources: [] },
      {
        levels: undefined,
        categories: undefined,
        sources: undefined,
        since: undefined,
        until: undefined,
        text: undefined,
        requestId: undefined,
        fingerprint: undefined,
        minDurationMs: undefined,
      },
    ];
    for (const filter of emptyFilters) {
      let thrown: unknown = null;
      try {
        purgeLogs(db, { scope: 'filtered', filter: filter as never });
      } catch (error) {
        thrown = error;
      }
      expect(thrown, JSON.stringify(filter)).toMatchObject({ code: 'LOG_FILTER_REQUIRED' });
    }
    expect(queryLogs(db, { limit: 200 }).entries).toHaveLength(total);
  });

  it('purges everything and is not rollbackable', () => {
    seedLogs();
    const result = purgeLogs(db, { scope: 'all' });
    expect(queryLogs(db, { limit: 200 }).entries).toHaveLength(0);
    expect(() => rollbackEvent(db, result.eventId!, false)).toThrow(/cannot be rolled back/);
  });

  it('retention removes old rows and reports the surviving count', () => {
    enqueueLog(db, { level: 'info', category: 'app', message: 'old', at: '2020-01-01T00:00:00.000Z' });
    enqueueLog(db, { level: 'info', category: 'app', message: 'new', at: new Date().toISOString() });
    flushLogs(db);
    const result = runRetention(db, new Date());
    expect(result.deletedByAge).toBe(1);
    // The new row plus the retention summary entry written at the end.
    expect(result.remaining).toBe(2);
    expect(count()).toBe(2);
  });

  it('retention trims the oldest rows over the cap and keeps the summary', () => {
    db.prepare(`UPDATE log_setting SET max_rows = 1000 WHERE id = 1`).run();
    invalidateLoggingSettings(db);
    for (let i = 0; i < 1001; i++) {
      enqueueLog(db, { level: 'info', category: 'app', message: `row ${i}` });
    }
    flushLogs(db);
    const result = runRetention(db, new Date());
    expect(result.deletedByRows).toBeGreaterThan(0);
    expect(count()).toBeLessThanOrEqual(1000);
    expect(result.remaining).toBe(count());
  });

  it('retention never writes an audit event', () => {
    const eventsBefore = (db.prepare(`SELECT COUNT(*) AS c FROM event_log`).get() as { c: number }).c;
    runRetention(db, new Date());
    expect((db.prepare(`SELECT COUNT(*) AS c FROM event_log`).get() as { c: number }).c).toBe(eventsBefore);
  });
});

describe('client log ingest', () => {
  it('accepts valid client entries and drops invalid ones individually', () => {
    const result = ingestClientLogs(db, [
      { level: 'error', message: 'vue boom', stack: 'Error: boom', at: new Date().toISOString() },
      { level: 'fatal', message: 'bad level' },
      { level: 'warn', message: 'warn', context: { token: 'secret' } },
    ]);
    flushLogs(db);
    expect(result).toEqual({ accepted: 2, rejected: 1 });
    const rows = db.prepare(`SELECT * FROM log_entry ORDER BY id`).all() as any[];
    expect(rows.map((r) => [r.source, r.category])).toEqual([
      ['client', 'client'],
      ['client', 'client'],
    ]);
    expect(rows[1].context).toBe(JSON.stringify({ token: '[redacted]' }));
  });

  it('forces client source/category and respects capture_client and levels', () => {
    updateLoggingSettings(db, settingsInput({ captureClient: false }));
    expect(ingestClientLogs(db, [{ level: 'error', message: 'x' }])).toEqual({ accepted: 0, rejected: 0 });
    updateLoggingSettings(
      db,
      settingsInput({
        levels: { http: 'inherit', sync: 'inherit', mcp: 'inherit', db: 'inherit', app: 'inherit', client: 'error' },
      }),
    );
    expect(ingestClientLogs(db, [{ level: 'warn', message: 'hidden' }])).toEqual({ accepted: 0, rejected: 0 });
  });
});

describe('CLI logging', () => {
  it('tags CLI entries with the cli source and flushes them on exit', () => {
    attachCliLogging(db);
    getLogger(db, 'sync').info('cli run finished');
    flushCliLogging(db);
    const row = db.prepare(`SELECT * FROM log_entry ORDER BY id DESC LIMIT 1`).get() as any;
    expect(row.source).toBe('cli');
    expect(row.message).toBe('cli run finished');
  });
});

describe('sync instrumentation', () => {
  it('records a failed sync run and its source error', async () => {
    const result = await runSync(db, 'wiki', {
      fetchImpl: async () => {
        throw new Error('network down');
      },
    } as never);
    expect(result.status).toBe('stale');
    flushLogs(db);
    const row = db.prepare(`SELECT * FROM log_entry WHERE category = 'sync' ORDER BY id DESC LIMIT 1`).get() as any;
    expect(row.level).toBe('error');
    expect(row.message).toContain('wiki');
    expect(JSON.parse(row.context).source).toBe('wiki');
    expect(row.request_id).toBeTruthy();
  });
});
