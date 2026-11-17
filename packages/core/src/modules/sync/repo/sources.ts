import type { Db } from '../../../platform/db/index.js';

export type SourceStatus = 'idle' | 'ok' | 'stale' | 'error';

export interface SourceRow {
  id: string;
  kind: string;
  url: string | null;
  status: SourceStatus;
  last_ok_at: string | null;
  last_try_at: string | null;
  last_error: string | null;
  commit_sha: string | null;
  commit_date: string | null;
  updated_at: string;
}

export const SOURCE_IDS = ['exbo_base', 'wiki', 'scpmodel', 'motifs', 'icons', 'profile', 'local'] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

const DEFAULT_KINDS: Record<string, string> = {
  exbo_base: 'reference',
  wiki: 'reference',
  motifs: 'reference',
  scpmodel: 'market',
  icons: 'icons',
  profile: 'profile',
  local: 'local',
};

export function ensureSource(db: Db, id: string, url?: string | null): SourceRow {
  db.prepare(
    `INSERT INTO source (id, kind, url, updated_at) VALUES (@id, @kind, @url, @updated_at)
     ON CONFLICT(id) DO UPDATE SET url = COALESCE(excluded.url, source.url), updated_at = excluded.updated_at`,
  ).run({
    id,
    kind: DEFAULT_KINDS[id] ?? 'other',
    url: url ?? null,
    updated_at: new Date().toISOString(),
  });
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

export interface SourceOkMeta {
  at?: string;
  commit?: string | null;
  commitDate?: string | null;
}

export function markSourceOk(db: Db, id: string, meta: SourceOkMeta = {}): void {
  db.prepare(
    `UPDATE source SET last_ok_at = @at, status = 'ok', last_error = NULL,
       commit_sha = COALESCE(@commit, commit_sha), commit_date = COALESCE(@commit_date, commit_date),
       updated_at = @at
     WHERE id = @id`,
  ).run({
    at: meta.at ?? new Date().toISOString(),
    commit: meta.commit ?? null,
    commit_date: meta.commitDate ?? null,
    id,
  });
}

export function markSourceStale(db: Db, id: string, error?: string | null, at = new Date().toISOString()): void {
  db.prepare(`UPDATE source SET status = 'stale', last_try_at = ?, last_error = ?, updated_at = ? WHERE id = ?`).run(
    at,
    error ?? null,
    at,
    id,
  );
}

export function markSourceError(db: Db, id: string, error: string, at = new Date().toISOString()): void {
  db.prepare(`UPDATE source SET status = 'error', last_try_at = ?, last_error = ?, updated_at = ? WHERE id = ?`).run(
    at,
    error,
    at,
    id,
  );
}
