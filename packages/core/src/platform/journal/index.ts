import type { Db } from '../db/index.js';

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
}

export function logEvent(db: Db, input: EventInput): number {
  const info = db
    .prepare(
      `INSERT INTO event_log (at, actor, action, entity, entity_id, before, after, note)
       VALUES (@at, @actor, @action, @entity, @entity_id, @before, @after, @note)`,
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
}

export function snapshotEvents(db: Db): EventSnapshotRow[] {
  return db
    .prepare(
      `SELECT id, at, actor, action, entity, entity_id, before, after, note
       FROM event_log ORDER BY id`,
    )
    .all() as EventSnapshotRow[];
}

/** Replaces the whole journal with a snapshot, restoring original ids. */
export function replaceEvents(db: Db, rows: EventSnapshotRow[]): void {
  db.prepare(`DELETE FROM event_log`).run();
  const insert = db.prepare(
    `INSERT INTO event_log (id, at, actor, action, entity, entity_id, before, after, note)
     VALUES (@id, @at, @actor, @action, @entity, @entity_id, @before, @after, @note)`,
  );
  for (const row of rows) insert.run(row);
}
