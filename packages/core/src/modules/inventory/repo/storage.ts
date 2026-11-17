import { norm } from '@profile/shared';
import type { Db } from '../../../platform/db/index.js';

export interface StorageRow {
  id: number;
  character_id: number;
  kind: 'inventory' | 'stash';
  name: string;
  name_norm: string;
  width: number;
  height: number;
  max_weight: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface StorageInput {
  characterId: number;
  kind: 'inventory' | 'stash';
  name: string;
  width: number;
  height: number;
  maxWeight?: number | null;
  sortOrder?: number;
}

export function insertStorage(db: Db, input: StorageInput): number {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO storage
        (character_id, kind, name, name_norm, width, height, max_weight, sort_order, created_at, updated_at)
       VALUES (@character_id, @kind, @name, @name_norm, @width, @height, @max_weight, @sort_order, @created_at, @updated_at)`,
    )
    .run({
      character_id: input.characterId,
      kind: input.kind,
      name: input.name,
      name_norm: norm(input.name),
      width: input.width,
      height: input.height,
      max_weight: input.maxWeight ?? null,
      sort_order: input.sortOrder ?? 0,
      created_at: now,
      updated_at: now,
    });
  return Number(info.lastInsertRowid);
}

export function getStorage(db: Db, id: number): StorageRow | null {
  return (db.prepare(`SELECT * FROM storage WHERE id = ?`).get(id) as StorageRow | undefined) ?? null;
}

export function getInventoryStorage(db: Db, characterId: number): StorageRow | null {
  return (
    (db
      .prepare(`SELECT * FROM storage WHERE character_id = ? AND kind = 'inventory' LIMIT 1`)
      .get(characterId) as StorageRow | undefined) ?? null
  );
}

export function listStorages(db: Db, characterId: number): StorageRow[] {
  return db
    .prepare(
      `SELECT * FROM storage WHERE character_id = ?
       ORDER BY CASE kind WHEN 'inventory' THEN 0 ELSE 1 END, sort_order, id`,
    )
    .all(characterId) as StorageRow[];
}

export function updateStorageRow(
  db: Db,
  id: number,
  patch: Partial<Pick<StorageRow, 'name' | 'name_norm' | 'width' | 'height' | 'max_weight' | 'sort_order'>>,
): void {
  const changes: Record<string, unknown> = {};
  for (const column of ['name', 'name_norm', 'width', 'height', 'max_weight', 'sort_order'] as const) {
    if (patch[column] !== undefined) changes[column] = patch[column];
  }
  if (patch.name !== undefined && patch.name_norm === undefined) changes.name_norm = norm(patch.name);
  if (!Object.keys(changes).length) return;
  const sets = Object.keys(changes)
    .map((column) => `${column} = @${column}`)
    .join(', ');
  db.prepare(`UPDATE storage SET ${sets}, updated_at = @updated_at WHERE id = @id`).run({
    ...changes,
    updated_at: new Date().toISOString(),
    id,
  });
}

export function deleteStorageRow(db: Db, id: number): void {
  db.prepare(`DELETE FROM storage WHERE id = ?`).run(id);
}

/** Restores a storage snapshot with its original id, timestamps and order. */
export function restoreStorageRow(db: Db, row: StorageRow): void {
  db.prepare(
    `INSERT INTO storage
      (id, character_id, kind, name, name_norm, width, height, max_weight, sort_order, created_at, updated_at)
     VALUES
      (@id, @character_id, @kind, @name, @name_norm, @width, @height, @max_weight, @sort_order, @created_at,
       @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       character_id = excluded.character_id,
       kind = excluded.kind,
       name = excluded.name,
       name_norm = excluded.name_norm,
       width = excluded.width,
       height = excluded.height,
       max_weight = excluded.max_weight,
       sort_order = excluded.sort_order,
       updated_at = excluded.updated_at`,
  ).run(row);
}
