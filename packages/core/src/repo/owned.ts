import type { Db } from '../db/index.js';

export interface OwnedRow {
  id: number;
  character_id: number;
  item_id: number;
  kind: string;
  level: number;
  skin_item_id: number | null;
  quality: string | null;
  note: string | null;
  role: string | null;
  slot: string | null;
  extra: string | null;
  updated_at: string;
}

export interface OwnedJoined extends OwnedRow {
  item_name: string;
  item_name_en: string | null;
  item_kind: string;
  category: string | null;
  item_rank: string | null;
  item_slot: string | null;
  item_weight: number | null;
  item_icon: string | null;
  item_raw: string;
  exbo_id: string;
}

export interface ContainerFillRow {
  container_owned_id: number;
  slot: number;
  artifact_item_id: number;
  level: number;
  quality: string | null;
  as_of: string;
  artifact_name?: string;
  artifact_rank?: string | null;
  artifact_icon?: string | null;
}

export interface OwnedInput {
  characterId: number;
  itemId: number;
  kind: string;
  level?: number;
  skinItemId?: number | null;
  quality?: string | null;
  note?: string | null;
  role?: string | null;
  slot?: string | null;
  extra?: unknown;
}

export function findOwned(
  db: Db,
  characterId: number,
  itemId: number,
  level: number,
  skinItemId: number | null,
): OwnedRow | null {
  return (
    (db
      .prepare(
        `SELECT * FROM owned
         WHERE character_id = ? AND item_id = ? AND level = ? AND COALESCE(skin_item_id, 0) = COALESCE(?, 0)`,
      )
      .get(characterId, itemId, level, skinItemId) as OwnedRow | undefined) ?? null
  );
}

export function upsertOwned(db: Db, input: OwnedInput): number {
  const level = input.level ?? 0;
  const skinItemId = input.skinItemId ?? null;
  const existing = findOwned(db, input.characterId, input.itemId, level, skinItemId);
  const now = new Date().toISOString();
  const extra = input.extra === undefined ? null : JSON.stringify(input.extra);

  if (existing) {
    db.prepare(
      `UPDATE owned SET quality = COALESCE(@quality, quality), note = COALESCE(@note, note),
        role = COALESCE(@role, role), slot = COALESCE(@slot, slot), extra = COALESCE(@extra, extra),
        updated_at = @updated_at
       WHERE id = @id`,
    ).run({
      quality: input.quality ?? null,
      note: input.note ?? null,
      role: input.role ?? null,
      slot: input.slot ?? null,
      extra,
      updated_at: now,
      id: existing.id,
    });
    return existing.id;
  }

  const info = db
    .prepare(
      `INSERT INTO owned (character_id, item_id, kind, level, skin_item_id, quality, note, role, slot, extra, updated_at)
       VALUES (@character_id, @item_id, @kind, @level, @skin_item_id, @quality, @note, @role, @slot, @extra, @updated_at)`,
    )
    .run({
      character_id: input.characterId,
      item_id: input.itemId,
      kind: input.kind,
      level,
      skin_item_id: skinItemId,
      quality: input.quality ?? null,
      note: input.note ?? null,
      role: input.role ?? null,
      slot: input.slot ?? null,
      extra,
      updated_at: now,
    });
  return Number(info.lastInsertRowid);
}

export function updateOwnedById(
  db: Db,
  id: number,
  patch: Partial<Pick<OwnedRow, 'level' | 'quality' | 'note' | 'role' | 'slot' | 'skin_item_id'>>,
): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, updated_at: new Date().toISOString() };
  for (const key of ['level', 'quality', 'note', 'role', 'slot', 'skin_item_id'] as const) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = @${key}`);
      params[key] = patch[key];
    }
  }
  if (!sets.length) return;
  db.prepare(`UPDATE owned SET ${sets.join(', ')}, updated_at = @updated_at WHERE id = @id`).run(params);
}

export function deleteOwned(db: Db, id: number): void {
  db.prepare(`DELETE FROM owned WHERE id = ?`).run(id);
}

export function deleteOwnedByItem(db: Db, characterId: number, itemId: number, level?: number): number {
  const info =
    level == null
      ? db.prepare(`DELETE FROM owned WHERE character_id = ? AND item_id = ?`).run(characterId, itemId)
      : db.prepare(`DELETE FROM owned WHERE character_id = ? AND item_id = ? AND level = ?`).run(
          characterId,
          itemId,
          level,
        );
  return info.changes;
}

const JOIN_COLS = `
  o.*,
  i.name AS item_name, i.name_en AS item_name_en, i.kind AS item_kind, i.category AS category,
  i.rank AS item_rank, i.slot AS item_slot, i.weight AS item_weight, i.icon_path AS item_icon,
  i.raw AS item_raw, i.exbo_id AS exbo_id`;

export function listOwned(db: Db, characterId: number, kind?: string): OwnedJoined[] {
  const where = kind ? `WHERE o.character_id = ? AND o.kind = ?` : `WHERE o.character_id = ?`;
  const params = kind ? [characterId, kind] : [characterId];
  return db
    .prepare(`SELECT ${JOIN_COLS} FROM owned o JOIN item i ON i.id = o.item_id ${where} ORDER BY o.kind, i.name_norm`)
    .all(...params) as OwnedJoined[];
}

export function getOwned(db: Db, id: number): OwnedJoined | null {
  return (
    (db
      .prepare(`SELECT ${JOIN_COLS} FROM owned o JOIN item i ON i.id = o.item_id WHERE o.id = ?`)
      .get(id) as OwnedJoined | undefined) ?? null
  );
}

export function findOwnedByName(db: Db, characterId: number, kind: string, name: string): OwnedJoined | null {
  return (
    (db
      .prepare(
        `SELECT ${JOIN_COLS} FROM owned o JOIN item i ON i.id = o.item_id
         WHERE o.character_id = ? AND o.kind = ? AND i.name_norm = ?
         ORDER BY o.level DESC LIMIT 1`,
      )
      .get(characterId, kind, name) as OwnedJoined | undefined) ?? null
  );
}

export function replaceContainerFill(
  db: Db,
  ownedId: number,
  artifacts: { itemId: number; level: number; quality?: string | null }[],
  asOf: string,
): void {
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM container_fill WHERE container_owned_id = ?`).run(ownedId);
    const stmt = db.prepare(
      `INSERT INTO container_fill (container_owned_id, slot, artifact_item_id, level, quality, as_of)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    artifacts.forEach((a, index) => stmt.run(ownedId, index, a.itemId, a.level, a.quality ?? null, asOf));
  });
  run();
}

export function listContainerFill(db: Db, ownedId: number): ContainerFillRow[] {
  return db
    .prepare(
      `SELECT cf.*, i.name AS artifact_name, i.rank AS artifact_rank, i.icon_path AS artifact_icon
       FROM container_fill cf JOIN item i ON i.id = cf.artifact_item_id
       WHERE cf.container_owned_id = ? ORDER BY cf.slot`,
    )
    .all(ownedId) as ContainerFillRow[];
}

export function allContainerFill(db: Db, characterId: number): Record<number, ContainerFillRow[]> {
  const rows = db
    .prepare(
      `SELECT cf.*, i.name AS artifact_name, i.rank AS artifact_rank, i.icon_path AS artifact_icon
       FROM container_fill cf
       JOIN item i ON i.id = cf.artifact_item_id
       JOIN owned o ON o.id = cf.container_owned_id
       WHERE o.character_id = ?
       ORDER BY cf.container_owned_id, cf.slot`,
    )
    .all(characterId) as ContainerFillRow[];
  const out: Record<number, ContainerFillRow[]> = {};
  for (const row of rows) (out[row.container_owned_id] ||= []).push(row);
  return out;
}
