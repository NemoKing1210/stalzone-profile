import type { Db } from '../../../platform/db/index.js';
import { enqueueLog, flushLogs, readEffectiveLogging } from '../../../platform/logging/index.js';

export interface RetentionResult {
  deletedByAge: number;
  deletedByRows: number;
  /** Final row count, including the summary entry when one was written. */
  remaining: number;
}

const CHUNK = 10_000;
const DAY_MS = 86_400_000;
const RETENTION_KEY = '__profileLogRetention';

interface RetentionTimers {
  initial: ReturnType<typeof setTimeout>;
  interval: ReturnType<typeof setInterval>;
}

function countRows(db: Db): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM log_entry`).get() as { c: number }).c;
}

function trimToCap(db: Db, maxRows: number): number {
  let deleted = 0;
  for (;;) {
    const excess = countRows(db) - maxRows;
    if (excess <= 0) return deleted;
    const chunk = Math.min(excess, CHUNK);
    const changes = db
      .prepare(`DELETE FROM log_entry WHERE id IN (SELECT id FROM log_entry ORDER BY id ASC LIMIT ?)`)
      .run(chunk).changes;
    deleted += changes;
    if (changes === 0) return deleted;
  }
}

/**
 * Ages out old rows and trims the table to `max_rows`. It is a maintenance job, not
 * a user action: it writes no `event_log` entry, only one summarizing log entry.
 */
export function runRetention(db: Db, now = new Date()): RetentionResult {
  const settings = readEffectiveLogging(db);
  const cutoff = new Date(now.getTime() - settings.retentionDays * DAY_MS).toISOString();

  const deletedByAge = db.prepare(`DELETE FROM log_entry WHERE at < ?`).run(cutoff).changes;
  let deletedByRows = trimToCap(db, settings.maxRows);

  if (settings.enabled) {
    enqueueLog(db, {
      level: 'info',
      category: 'app',
      message: 'log retention',
      context: { deletedByAge, deletedByRows, maxRows: settings.maxRows, retentionDays: settings.retentionDays },
    });
    flushLogs(db);
    // The summary is written last, so it can be the row that pushes the table over.
    deletedByRows += trimToCap(db, settings.maxRows);
  }

  return { deletedByAge, deletedByRows, remaining: countRows(db) };
}

function retentionGlobals(): { [RETENTION_KEY]?: RetentionTimers } {
  return globalThis as typeof globalThis & { [RETENTION_KEY]?: RetentionTimers };
}

/** Installs one hourly sweeper (plus a first pass after 30 s); replaces an existing one. */
export function startRetentionTimer(db: Db): void {
  stopRetentionTimer();
  const run = () => {
    try {
      runRetention(db);
    } catch (error) {
      console.error('[logging] retention failed', error instanceof Error ? error.message : String(error));
    }
  };

  const initial = setTimeout(run, 30_000);
  const interval = setInterval(run, 3_600_000);
  initial.unref?.();
  interval.unref?.();
  retentionGlobals()[RETENTION_KEY] = { initial, interval };
}

export function stopRetentionTimer(): void {
  const globals = retentionGlobals();
  const timers = globals[RETENTION_KEY];
  if (!timers) return;
  clearTimeout(timers.initial);
  clearInterval(timers.interval);
  globals[RETENTION_KEY] = undefined;
}
