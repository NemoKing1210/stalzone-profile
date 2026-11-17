import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeDb,
  flushLogs,
  getLogger,
  migrate,
  openDb,
  resetLoggingForTests,
  withTransaction,
  type Db,
} from '@profile/core';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-logging-writer-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
});

afterEach(() => {
  resetLoggingForTests();
  if (db.open) closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function count(): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM log_entry`).get() as { c: number }).c;
}

describe('logging writer', () => {
  it('filters by level, redacts and flushes a batch', () => {
    const log = getLogger(db, 'app', { source: 'server' });
    log.debug('hidden');
    log.warn('token leak', { url: '/api?token=abc', password: 'p' });
    flushLogs(db);
    const rows = db.prepare(`SELECT * FROM log_entry ORDER BY id`).all() as Record<string, any>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.level).toBe('warn');
    expect(rows[0]!.message).toBe('token leak');
    expect(rows[0]!.context).toBe(JSON.stringify({ url: '/api?…', password: '[redacted]' }));
    expect(rows[0]!.source).toBe('server');
    expect(rows[0]!.fingerprint).toMatch(/^[0-9a-f]{40}$/);
  });

  it('keeps a warn emitted inside a transaction that rolls back', () => {
    const log = getLogger(db, 'app');
    expect(() =>
      withTransaction(db, () => {
        log.error('boom inside');
        throw new Error('rollback');
      }),
    ).toThrow('rollback');
    expect(count()).toBe(0);
    flushLogs(db);
    expect(count()).toBe(1);
  });

  it('does not let a later info entry postpone an error flush', () => {
    vi.useFakeTimers();
    try {
      const log = getLogger(db, 'app');
      log.error('boom');
      log.info('later');
      vi.advanceTimersByTime(0);
      expect(count()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes immediately when the queue reaches 200 entries', () => {
    db.prepare(`UPDATE log_setting SET mirror_stdout = 0 WHERE id = 1`).run();
    vi.useFakeTimers();
    try {
      const log = getLogger(db, 'app');
      for (let i = 0; i < 200; i++) log.info(`row ${i}`);
      expect(count()).toBe(0);
      vi.advanceTimersByTime(0);
      expect(count()).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never throws when the database is closed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = getLogger(db, 'app');
    db.close();
    expect(() => log.error('after close')).not.toThrow();
    expect(() => flushLogs(db)).not.toThrow();
  });
});
