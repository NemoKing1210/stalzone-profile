import { norm } from '@dossier/shared';
import type { Db } from '../db/index.js';

export interface CatalogEntryRow {
  id: number;
  kind: string;
  position: number;
  name: string;
  name_norm: string;
  data: string;
  updated_at: string;
}

export interface CatalogEntryInput {
  name: string;
  data: unknown;
}

/**
 * Replaces the catalog snapshot for one kind. Positions are the legacy display order,
 * so duplicate names stay as separate entries.
 */
export function insertCatalogEntries(db: Db, kind: string, entries: CatalogEntryInput[]): number {
  const now = new Date().toISOString();
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM catalog_entry WHERE kind = ?`).run(kind);
    const stmt = db.prepare(
      `INSERT INTO catalog_entry (kind, position, name, name_norm, data, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    entries.forEach((entry, position) => {
      stmt.run(kind, position, entry.name, norm(entry.name), JSON.stringify(entry.data ?? null), now);
    });
  });
  run();
  return entries.length;
}

export function listCatalogEntries(db: Db, kind: string): CatalogEntryRow[] {
  return db
    .prepare(`SELECT * FROM catalog_entry WHERE kind = ? ORDER BY position, id`)
    .all(kind) as CatalogEntryRow[];
}

export function clearCatalogEntries(db: Db, kind?: string): void {
  if (kind) db.prepare(`DELETE FROM catalog_entry WHERE kind = ?`).run(kind);
  else db.exec(`DELETE FROM catalog_entry`);
}
