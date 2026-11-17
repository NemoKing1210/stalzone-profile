import type { Db } from '../../../platform/db/index.js';

export interface IconRow {
  id: number;
  item_id: number;
  path: string;
  mime: string;
  sha1: string;
  source_id: string | null;
  updated_at: string;
}

export interface IconInput {
  itemId: number;
  path: string;
  mime?: string;
  sha1: string;
  sourceId?: string;
}

export function upsertIcon(db: Db, input: IconInput): void {
  db.prepare(
    `INSERT INTO icon (item_id, path, mime, sha1, source_id, updated_at)
     VALUES (@item_id, @path, @mime, @sha1, @source_id, @updated_at)
     ON CONFLICT(item_id) DO UPDATE SET
       path = excluded.path, mime = excluded.mime, sha1 = excluded.sha1,
       source_id = excluded.source_id, updated_at = excluded.updated_at`,
  ).run({
    item_id: input.itemId,
    path: input.path,
    mime: input.mime ?? 'image/webp',
    sha1: input.sha1,
    source_id: input.sourceId ?? 'local',
    updated_at: new Date().toISOString(),
  });
}

export function getIcon(db: Db, itemId: number): IconRow | null {
  return (db.prepare(`SELECT * FROM icon WHERE item_id = ?`).get(itemId) as IconRow | undefined) ?? null;
}

const KIND_PREFIXES: Record<string, string> = {
  weapon: 'w',
  armor: 'a',
  artifact: 'art',
  container: 'c',
};

/** Legacy `<prefix>:<name>` icon keys still consumed by the payload and the UI. */
export function iconMap(db: Db): Record<string, string> {
  const rows = db
    .prepare(`SELECT i.kind AS kind, i.name AS name, ic.path AS path FROM icon ic JOIN item i ON i.id = ic.item_id`)
    .all() as { kind: string; name: string; path: string }[];
  const out: Record<string, string> = {};
  for (const row of rows) {
    const prefix = KIND_PREFIXES[row.kind];
    if (!prefix) continue;
    out[`${prefix}:${row.name}`] = row.path;
  }
  return out;
}

export function iconsByItemIds(db: Db, ids: number[]): Map<number, string> {
  const out = new Map<number, string>();
  if (!ids.length) return out;
  const placeholders = new Array(ids.length).fill('?').join(', ');
  const rows = db
    .prepare(`SELECT item_id, path FROM icon WHERE item_id IN (${placeholders})`)
    .all(...ids) as { item_id: number; path: string }[];
  for (const row of rows) out.set(row.item_id, row.path);
  return out;
}

export function deleteAllIcons(db: Db): void {
  db.exec(`DELETE FROM icon`);
}
