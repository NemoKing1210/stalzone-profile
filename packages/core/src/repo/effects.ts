import type { Db } from '../db/index.js';

export interface ItemEffectInput {
  position: number;
  label: string;
  isPositive?: boolean;
}

export interface ItemEffectRow {
  item_id: number;
  position: number;
  label: string;
  is_positive: number;
}

export function replaceItemEffects(db: Db, itemId: number, effects: ItemEffectInput[]): void {
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM item_effect WHERE item_id = ?`).run(itemId);
    const stmt = db.prepare(`INSERT INTO item_effect (item_id, position, label, is_positive) VALUES (?, ?, ?, ?)`);
    for (const effect of effects) stmt.run(itemId, effect.position, effect.label, effect.isPositive === false ? 0 : 1);
  });
  run();
}

export function listItemEffects(db: Db, itemId: number): ItemEffectRow[] {
  return db
    .prepare(`SELECT item_id, position, label, is_positive FROM item_effect WHERE item_id = ? ORDER BY position`)
    .all(itemId) as ItemEffectRow[];
}

export function allItemEffects(db: Db): Record<number, ItemEffectRow[]> {
  const rows = db
    .prepare(`SELECT item_id, position, label, is_positive FROM item_effect ORDER BY item_id, position`)
    .all() as ItemEffectRow[];
  const out: Record<number, ItemEffectRow[]> = {};
  for (const row of rows) (out[row.item_id] ||= []).push(row);
  return out;
}
