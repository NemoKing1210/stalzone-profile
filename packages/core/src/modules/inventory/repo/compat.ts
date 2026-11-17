import type { Db } from '../../../platform/db/index.js';

export interface CompatRow {
  attachment_item_id: number;
  weapon_item_id: number;
  source: 'exbo' | 'manual';
  updated_at: string;
}

export interface CompatInput {
  attachmentItemId: number;
  weaponItemId: number;
}

/** Replaces only the EXBO edges; manual edges survive. */
export function replaceExboCompat(db: Db, rows: readonly CompatInput[]): void {
  const now = new Date().toISOString();
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM attachment_compat WHERE source = 'exbo'`).run();
    const stmt = db.prepare(
      `INSERT INTO attachment_compat (attachment_item_id, weapon_item_id, source, updated_at)
       VALUES (?, ?, 'exbo', ?)
       ON CONFLICT(attachment_item_id, weapon_item_id) DO NOTHING`,
    );
    for (const row of rows) stmt.run(row.attachmentItemId, row.weaponItemId, now);
  });
  run();
}

export function listCompatForAttachment(db: Db, attachmentItemId: number): CompatRow[] {
  return db
    .prepare(`SELECT * FROM attachment_compat WHERE attachment_item_id = ? ORDER BY weapon_item_id`)
    .all(attachmentItemId) as CompatRow[];
}

export function isCompatible(db: Db, attachmentItemId: number, weaponItemId: number): boolean {
  return (
    db
      .prepare(`SELECT 1 FROM attachment_compat WHERE attachment_item_id = ? AND weapon_item_id = ? LIMIT 1`)
      .get(attachmentItemId, weaponItemId) !== undefined
  );
}
