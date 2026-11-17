import type { Db } from '../../../platform/db/index.js';

export interface ItemLayoutRow {
  item_id: number;
  width: number;
  height: number;
  weight: number | null;
  updated_at: string;
}

export function getItemLayout(db: Db, itemId: number): ItemLayoutRow | null {
  return (db.prepare(`SELECT * FROM item_layout WHERE item_id = ?`).get(itemId) as ItemLayoutRow | undefined) ?? null;
}

function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}

/** Layout overrides for many items in one statement. */
export function itemLayoutsByItemIds(db: Db, itemIds: number[]): Map<number, ItemLayoutRow> {
  const out = new Map<number, ItemLayoutRow>();
  if (!itemIds.length) return out;
  const rows = db
    .prepare(`SELECT * FROM item_layout WHERE item_id IN (${placeholders(itemIds.length)})`)
    .all(...itemIds) as ItemLayoutRow[];
  for (const row of rows) out.set(row.item_id, row);
  return out;
}

export function upsertItemLayout(
  db: Db,
  itemId: number,
  input: { width: number; height: number; weight?: number | null },
): void {
  db.prepare(
    `INSERT INTO item_layout (item_id, width, height, weight, updated_at)
     VALUES (@item_id, @width, @height, @weight, @updated_at)
     ON CONFLICT(item_id) DO UPDATE SET
       width = excluded.width,
       height = excluded.height,
       weight = excluded.weight,
       updated_at = excluded.updated_at`,
  ).run({
    item_id: itemId,
    width: input.width,
    height: input.height,
    weight: input.weight ?? null,
    updated_at: new Date().toISOString(),
  });
}

export function deleteItemLayout(db: Db, itemId: number): void {
  db.prepare(`DELETE FROM item_layout WHERE item_id = ?`).run(itemId);
}

/** Restores a layout override exactly as it was, including its `updated_at`. */
export function restoreItemLayoutRow(db: Db, row: ItemLayoutRow): void {
  db.prepare(
    `INSERT INTO item_layout (item_id, width, height, weight, updated_at)
     VALUES (@item_id, @width, @height, @weight, @updated_at)
     ON CONFLICT(item_id) DO UPDATE SET
       width = excluded.width,
       height = excluded.height,
       weight = excluded.weight,
       updated_at = excluded.updated_at`,
  ).run(row);
}
