import type { Db } from '../db/index.js';

export type SourceStatus = 'idle' | 'ok' | 'stale' | 'error';

export interface SourceRow {
  id: string;
  kind: string;
  url: string | null;
  last_ok_at: string | null;
  last_try_at: string | null;
  etag: string | null;
  status: SourceStatus;
  last_error: string | null;
}

export const SOURCE_IDS = ['exbo_base', 'wiki', 'scpmodel', 'profile', 'motifs', 'local'] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

const DEFAULT_KINDS: Record<string, string> = {
  exbo_base: 'base',
  wiki: 'wiki',
  scpmodel: 'prices',
  profile: 'profile',
  motifs: 'motifs',
  local: 'local',
};

export function ensureSource(db: Db, id: string, url?: string | null): SourceRow {
  db.prepare(
    `INSERT INTO source (id, kind, url) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET url = COALESCE(excluded.url, source.url)`,
  ).run(id, DEFAULT_KINDS[id] ?? 'other', url ?? null);
  return getSource(db, id)!;
}

export function ensureDefaultSources(db: Db): void {
  for (const id of SOURCE_IDS) ensureSource(db, id);
}

export function getSource(db: Db, id: string): SourceRow | null {
  return (db.prepare(`SELECT * FROM source WHERE id = ?`).get(id) as SourceRow | undefined) ?? null;
}

export function listSources(db: Db): SourceRow[] {
  return db.prepare(`SELECT * FROM source ORDER BY id`).all() as SourceRow[];
}

export function markSourceTry(db: Db, id: string, at = new Date().toISOString()): void {
  db.prepare(`UPDATE source SET last_try_at = ? WHERE id = ?`).run(at, id);
}

export function markSourceOk(db: Db, id: string, etag?: string | null, at = new Date().toISOString()): void {
  db.prepare(
    `UPDATE source SET last_ok_at = ?, status = 'ok', last_error = NULL, etag = COALESCE(?, etag) WHERE id = ?`,
  ).run(at, etag ?? null, id);
}

export function markSourceStale(db: Db, id: string, error?: string | null, at = new Date().toISOString()): void {
  db.prepare(`UPDATE source SET status = 'stale', last_try_at = ?, last_error = ? WHERE id = ?`).run(
    at,
    error ?? null,
    id,
  );
}

export function markSourceError(db: Db, id: string, error: string, at = new Date().toISOString()): void {
  db.prepare(`UPDATE source SET status = 'error', last_try_at = ?, last_error = ? WHERE id = ?`).run(at, error, id);
}
