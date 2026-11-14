import type { Db } from '../db/index.js';

export interface IconRow {
  key: string;
  path: string;
  mime: string;
  source_id: string | null;
  updated_at: string;
}

export function upsertIcon(db: Db, key: string, path: string, sourceId = 'local', mime = 'image/webp'): void {
  db.prepare(
    `INSERT INTO icon (key, path, mime, source_id, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET path = excluded.path, mime = excluded.mime, source_id = excluded.source_id,
       updated_at = excluded.updated_at`,
  ).run(key, path, mime, sourceId, new Date().toISOString());
}

export function listIcons(db: Db): IconRow[] {
  return db.prepare(`SELECT * FROM icon ORDER BY key`).all() as IconRow[];
}

export function iconMap(db: Db): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of listIcons(db)) out[row.key] = row.path;
  return out;
}

export function getIcon(db: Db, key: string): IconRow | null {
  return (db.prepare(`SELECT * FROM icon WHERE key = ?`).get(key) as IconRow | undefined) ?? null;
}

export function deleteAllIcons(db: Db): void {
  db.exec(`DELETE FROM icon`);
}
