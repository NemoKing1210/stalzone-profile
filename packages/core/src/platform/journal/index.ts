import type { EventSummary } from '@profile/shared/contracts';
import type { Db } from '../db/index.js';
import { currentEventContext } from './context.js';
import { summarizeEvent } from './summary.js';

export type { EventContext } from './context.js';
export { currentEventContext, runWithEventContext } from './context.js';
export type { EventSummary } from '@profile/shared/contracts';
export { summarizeEvent, SUMMARY_FIELD_LIMIT } from './summary.js';

/* ------------------------------ write contract ------------------------------ */

/** The API contract owns the shape; core produces it, so the two cannot drift. */
export type { WriteDiff, WriteResult } from '@profile/shared/contracts';

export class WriteError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'WriteError';
  }
}

/** Runs `fn` in one SQLite transaction; a throw rolls everything back and rethrows. */
export function withTransaction<T>(db: Db, fn: () => T): T {
  return db.transaction(fn)();
}

/* ------------------------------ event log ------------------------------ */

export interface EventRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  before: string | null;
  after: string | null;
  note: string | null;
  request_id: string | null;
  origin: string | null;
  summary: string | null;
}

export interface EventInput {
  actor: string;
  action: string;
  entity?: string | null;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
  note?: string | null;
  at?: string;
  /** Defaults to the request context set by `runWithEventContext`, then to NULL. */
  requestId?: string | null;
  /** Defaults to the request context set by `runWithEventContext`, then to NULL. */
  origin?: string | null;
  /** Defaults to `summarizeEvent(action, before, after)`. */
  summary?: EventSummary;
}

export function logEvent(db: Db, input: EventInput): number {
  const context = currentEventContext();
  const info = db
    .prepare(
      `INSERT INTO event_log
         (at, actor, action, entity, entity_id, before, after, note, request_id, origin, summary)
       VALUES
         (@at, @actor, @action, @entity, @entity_id, @before, @after, @note, @request_id, @origin, @summary)`,
    )
    .run({
      at: input.at ?? new Date().toISOString(),
      actor: input.actor,
      action: input.action,
      entity: input.entity ?? null,
      entity_id: input.entityId == null ? null : String(input.entityId),
      before: input.before == null ? null : JSON.stringify(input.before),
      after: input.after == null ? null : JSON.stringify(input.after),
      note: input.note ?? null,
      request_id: input.requestId ?? context?.requestId ?? null,
      origin: input.origin ?? context?.origin ?? null,
      summary: JSON.stringify(
        input.summary ?? summarizeEvent(input.action, input.before ?? null, input.after ?? null),
      ),
    });
  return Number(info.lastInsertRowid);
}

export function getEvent(db: Db, id: number): EventRow | null {
  return (db.prepare(`SELECT * FROM event_log WHERE id = ?`).get(id) as EventRow | undefined) ?? null;
}

export function listEvents(db: Db, limit = 50): EventRow[] {
  return db.prepare(`SELECT * FROM event_log ORDER BY id DESC LIMIT ?`).all(limit) as EventRow[];
}

export function parseEventJson(value: string | null): unknown {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function eventCount(db: Db): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM event_log`).get() as { c: number }).c;
}

/** Raw rows as stored: `before`/`after` stay JSON strings for a lossless snapshot. */
export interface EventSnapshotRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  before: string | null;
  after: string | null;
  note: string | null;
  /** Optional so a snapshot written before 0009 still restores, with NULL context. */
  request_id?: string | null;
  origin?: string | null;
  summary?: string | null;
}

export interface SnapshotLimits {
  maxRows?: number;
  maxBytes?: number;
}

const SNAPSHOT_MAX_ROWS = 20_000;
const SNAPSHOT_MAX_BYTES = 32 * 1024 * 1024;

/**
 * A destructive action stores the whole journal in one `before` value. Refuse
 * before allocating it when the journal has grown past a safe snapshot size.
 */
export function snapshotEvents(db: Db, limits: SnapshotLimits = {}): EventSnapshotRow[] {
  const maxRows = limits.maxRows ?? SNAPSHOT_MAX_ROWS;
  const maxBytes = limits.maxBytes ?? SNAPSHOT_MAX_BYTES;
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS rows,
              COALESCE(SUM(LENGTH(COALESCE(before, '')) + LENGTH(COALESCE(after, ''))), 0) AS bytes
       FROM event_log`,
    )
    .get() as { rows: number; bytes: number };
  if (totals.rows > maxRows || totals.bytes > maxBytes) {
    throw new WriteError(
      413,
      'JOURNAL_TOO_LARGE',
      `The journal is too large to snapshot (${totals.rows} events, ${totals.bytes} bytes); clear it in smaller steps`,
    );
  }
  return db
    .prepare(
      `SELECT id, at, actor, action, entity, entity_id, before, after, note,
              request_id, origin, summary
       FROM event_log ORDER BY id`,
    )
    .all() as EventSnapshotRow[];
}

/** Replaces the whole journal with a snapshot, restoring original ids; context defaults to NULL. */
export function replaceEvents(db: Db, rows: EventSnapshotRow[]): void {
  db.prepare(`DELETE FROM event_log`).run();
  const insert = db.prepare(
    `INSERT INTO event_log
       (id, at, actor, action, entity, entity_id, before, after, note, request_id, origin, summary)
     VALUES
       (@id, @at, @actor, @action, @entity, @entity_id, @before, @after, @note, @request_id, @origin, @summary)`,
  );
  for (const row of rows) {
    insert.run({
      id: row.id,
      at: row.at,
      actor: row.actor,
      action: row.action,
      entity: row.entity,
      entity_id: row.entity_id,
      before: row.before,
      after: row.after,
      note: row.note,
      request_id: row.request_id ?? null,
      origin: row.origin ?? null,
      summary: row.summary ?? null,
    });
  }
}
