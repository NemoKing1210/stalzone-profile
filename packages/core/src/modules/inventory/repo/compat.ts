import type { Db } from '../../../platform/db/index.js';

export interface CompatRow {
  modification_item_id: number;
  weapon_item_id: number;
  source: 'exbo' | 'manual';
  updated_at: string;
}

export interface CompatInput {
  modificationItemId: number;
  weaponItemId: number;
}

/** Replaces only the EXBO edges; manual edges survive. */
export function replaceExboCompat(db: Db, rows: readonly CompatInput[]): void {
  const now = new Date().toISOString();
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM modification_compat WHERE source = 'exbo'`).run();
    const stmt = db.prepare(
      `INSERT INTO modification_compat (modification_item_id, weapon_item_id, source, updated_at)
       VALUES (?, ?, 'exbo', ?)
       ON CONFLICT(modification_item_id, weapon_item_id) DO NOTHING`,
    );
    for (const row of rows) stmt.run(row.modificationItemId, row.weaponItemId, now);
  });
  run();
}

export function listCompatForModification(db: Db, modificationItemId: number): CompatRow[] {
  return db
    .prepare(`SELECT * FROM modification_compat WHERE modification_item_id = ? ORDER BY weapon_item_id`)
    .all(modificationItemId) as CompatRow[];
}

export function isCompatible(db: Db, modificationItemId: number, weaponItemId: number): boolean {
  return (
    db
      .prepare(`SELECT 1 FROM modification_compat WHERE modification_item_id = ? AND weapon_item_id = ? LIMIT 1`)
      .get(modificationItemId, weaponItemId) !== undefined
  );
}
