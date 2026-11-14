import type { Db } from '../db/index.js';

export interface DetailsCardRow {
  key: string;
  item_id: number | null;
  kind: string;
  name: string;
  data: string;
  updated_at: string;
}

export interface DetailsCardInput {
  key: string;
  itemId?: number | null;
  kind: string;
  name: string;
  data: unknown;
}

/** Keys are the legacy `w:`, `a:`, `art:`, `c:` strings and are preserved verbatim. */
export function upsertDetailsCard(db: Db, input: DetailsCardInput): void {
  db.prepare(
    `INSERT INTO details_card (key, item_id, kind, name, data, updated_at)
     VALUES (@key, @item_id, @kind, @name, @data, @updated_at)
     ON CONFLICT(key) DO UPDATE SET
       item_id = COALESCE(excluded.item_id, details_card.item_id),
       kind = excluded.kind,
       name = excluded.name,
       data = excluded.data,
       updated_at = excluded.updated_at`,
  ).run({
    key: input.key,
    item_id: input.itemId ?? null,
    kind: input.kind,
    name: input.name,
    data: JSON.stringify(input.data ?? null),
    updated_at: new Date().toISOString(),
  });
}

export function getDetailsCard(db: Db, key: string): DetailsCardRow | null {
  return (db.prepare(`SELECT * FROM details_card WHERE key = ?`).get(key) as DetailsCardRow | undefined) ?? null;
}

export function listDetailsCards(db: Db, kind?: string): DetailsCardRow[] {
  if (kind) {
    return db.prepare(`SELECT * FROM details_card WHERE kind = ? ORDER BY key`).all(kind) as DetailsCardRow[];
  }
  return db.prepare(`SELECT * FROM details_card ORDER BY key`).all() as DetailsCardRow[];
}

export function clearDetailsCards(db: Db): void {
  db.exec(`DELETE FROM details_card`);
}
