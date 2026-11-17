import type { Db } from '../db/index.js';

export interface OwnedRow {
  id: number;
  character_id: number;
  item_id: number;
  kind: string;
  level: number;
  quality: string | null;
  skin_item_id: number | null;
  note: string | null;
  role: string | null;
  slot: string | null;
  qty: number;
  display_name: string | null;
  created_at: string;
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
  external_id: string;
  skin_name: string | null;
}

export interface ContainerInput {
  containerType?: string | null;
  shield?: number | null;
  bonus?: string | null;
  protection?: number | null;
  slots?: number | null;
  eff?: number | null;
}

export interface OwnedContainerRow {
  owned_id: number;
  container_type: string | null;
  shield: number | null;
  bonus: string | null;
  protection: number | null;
  slots: number | null;
  eff: number | null;
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
  qty?: number;
  displayName?: string | null;
  container?: ContainerInput | null;
}

export interface ContainerSlotRow {
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

export interface ContainerSlotInput {
  itemId: number;
  level?: number;
  quality?: string | null;
}

const CONTAINER_COLUMNS = ['container_type', 'shield', 'bonus', 'protection', 'slots', 'eff'] as const;

export function findOwned(
  db: Db,
  characterId: number,
  itemId: number,
  level: number,
  quality: string | null,
  skinItemId: number | null,
): OwnedRow | null {
  return (
    (db
      .prepare(
        `SELECT * FROM owned_item
         WHERE character_id = ? AND item_id = ? AND level = ?
           AND COALESCE(quality, '') = COALESCE(?, '')
           AND COALESCE(skin_item_id, 0) = COALESCE(?, 0)`,
      )
      .get(characterId, itemId, level, quality, skinItemId) as OwnedRow | undefined) ?? null
  );
}

/** Writes the complete six-column row: a null field is an explicit clear, not "keep current". */
export function upsertOwnedContainer(db: Db, ownedId: number, input: ContainerInput): void {
  db.prepare(
    `INSERT INTO owned_container (owned_id, ${CONTAINER_COLUMNS.join(', ')})
     VALUES (@owned_id, ${CONTAINER_COLUMNS.map((column) => '@' + column).join(', ')})
     ON CONFLICT(owned_id) DO UPDATE SET
       ${CONTAINER_COLUMNS.map((column) => `${column} = excluded.${column}`).join(', ')}`,
  ).run({
    owned_id: ownedId,
    container_type: input.containerType ?? null,
    shield: input.shield ?? null,
    bonus: input.bonus ?? null,
    protection: input.protection ?? null,
    slots: input.slots ?? null,
    eff: input.eff ?? null,
  });
}

export function deleteOwnedContainer(db: Db, ownedId: number): void {
  db.prepare(`DELETE FROM owned_container WHERE owned_id = ?`).run(ownedId);
}

export function getOwnedContainer(db: Db, ownedId: number): OwnedContainerRow | null {
  return (
    (db.prepare(`SELECT * FROM owned_container WHERE owned_id = ?`).get(ownedId) as OwnedContainerRow | undefined) ??
    null
  );
}

export function upsertOwned(db: Db, input: OwnedInput): number {
  const level = input.level ?? 0;
  const skinItemId = input.skinItemId ?? null;
  const quality = input.quality ?? null;
  const qty = Math.max(1, Math.trunc(input.qty ?? 1));
  const displayName = input.displayName ?? null;
  const existing = findOwned(db, input.characterId, input.itemId, level, quality, skinItemId);
  const now = new Date().toISOString();

  const run = db.transaction(() => {
    let id: number;
    if (existing) {
      db.prepare(
        `UPDATE owned_item SET note = COALESCE(@note, note),
          role = COALESCE(@role, role), slot = COALESCE(@slot, slot),
          qty = @qty, display_name = COALESCE(@display_name, display_name), updated_at = @updated_at
         WHERE id = @id`,
      ).run({
        note: input.note ?? null,
        role: input.role ?? null,
        slot: input.slot ?? null,
        qty,
        display_name: displayName,
        updated_at: now,
        id: existing.id,
      });
      id = existing.id;
    } else {
      const info = db
        .prepare(
          `INSERT INTO owned_item
            (character_id, item_id, kind, level, quality, skin_item_id, note, role, slot, qty, display_name,
             created_at, updated_at)
           VALUES (@character_id, @item_id, @kind, @level, @quality, @skin_item_id, @note, @role, @slot, @qty,
             @display_name, @created_at, @updated_at)`,
        )
        .run({
          character_id: input.characterId,
          item_id: input.itemId,
          kind: input.kind,
          level,
          quality,
          skin_item_id: skinItemId,
          note: input.note ?? null,
          role: input.role ?? null,
          slot: input.slot ?? null,
          qty,
          display_name: displayName,
          created_at: now,
          updated_at: now,
        });
      id = Number(info.lastInsertRowid);
    }
    if (input.container) upsertOwnedContainer(db, id, input.container);
    return id;
  });
  return run();
}

export type OwnedPatch = Partial<
  Pick<OwnedRow, 'level' | 'quality' | 'note' | 'role' | 'slot' | 'skin_item_id' | 'qty' | 'display_name'> & {
    container: ContainerInput | null;
  }
>;

export function updateOwnedById(db: Db, id: number, patch: OwnedPatch): void {
  const run = db.transaction(() => {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id, updated_at: new Date().toISOString() };
    for (const column of [
      'level',
      'quality',
      'note',
      'role',
      'slot',
      'skin_item_id',
      'qty',
      'display_name',
    ] as const) {
      if (patch[column] !== undefined) {
        sets.push(`${column} = @${column}`);
        params[column] = patch[column];
      }
    }
    if (patch.container !== undefined) {
      if (patch.container === null) deleteOwnedContainer(db, id);
      else upsertOwnedContainer(db, id, patch.container);
    }
    if (!sets.length) return;
    db.prepare(`UPDATE owned_item SET ${sets.join(', ')}, updated_at = @updated_at WHERE id = @id`).run(params);
  });
  run();
}

export function deleteOwned(db: Db, id: number): void {
  db.prepare(`DELETE FROM owned_item WHERE id = ?`).run(id);
}

export function deleteOwnedByItem(db: Db, characterId: number, itemId: number, level?: number): number {
  const info =
    level == null
      ? db.prepare(`DELETE FROM owned_item WHERE character_id = ? AND item_id = ?`).run(characterId, itemId)
      : db.prepare(`DELETE FROM owned_item WHERE character_id = ? AND item_id = ? AND level = ?`).run(
          characterId,
          itemId,
          level,
        );
  return info.changes;
}

const JOIN_COLS = `
  o.*,
  i.name AS item_name, i.name_en AS item_name_en, i.kind AS item_kind, i.category AS category,
  i.rank AS item_rank, i.slot AS item_slot, i.weight AS item_weight,
  ic.path AS item_icon, i.external_id AS external_id, s.name AS skin_name`;

const JOIN_TABLES = `
  FROM owned_item o
  JOIN item i ON i.id = o.item_id
  LEFT JOIN icon ic ON ic.item_id = o.item_id
  LEFT JOIN item s ON s.id = o.skin_item_id`;

export function ownedCounts(db: Db, characterId: number): { records: number; copies: number } {
  return db
    .prepare(`SELECT COUNT(*) AS records, COALESCE(SUM(qty), 0) AS copies FROM owned_item WHERE character_id = ?`)
    .get(characterId) as { records: number; copies: number };
}

export function listOwned(db: Db, characterId: number, kind?: string): OwnedJoined[] {
  const where = kind ? `WHERE o.character_id = ? AND o.kind = ?` : `WHERE o.character_id = ?`;
  const params = kind ? [characterId, kind] : [characterId];
  return db
    .prepare(`SELECT ${JOIN_COLS} ${JOIN_TABLES} ${where} ORDER BY o.kind, i.name_norm`)
    .all(...params) as OwnedJoined[];
}

export function getOwned(db: Db, id: number): OwnedJoined | null {
  return (
    (db.prepare(`SELECT ${JOIN_COLS} ${JOIN_TABLES} WHERE o.id = ?`).get(id) as OwnedJoined | undefined) ?? null
  );
}

export function findOwnedByName(db: Db, characterId: number, kind: string, name: string): OwnedJoined | null {
  return (
    (db
      .prepare(
        `SELECT ${JOIN_COLS} ${JOIN_TABLES}
         WHERE o.character_id = ? AND o.kind = ? AND i.name_norm = ?
         ORDER BY o.level DESC LIMIT 1`,
      )
      .get(characterId, kind, name) as OwnedJoined | undefined) ?? null
  );
}

export function replaceContainerSlots(
  db: Db,
  ownedId: number,
  slots: ContainerSlotInput[],
  asOf: string,
): void {
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM container_slot WHERE container_owned_id = ?`).run(ownedId);
    const stmt = db.prepare(
      `INSERT INTO container_slot (container_owned_id, slot, artifact_item_id, level, quality, as_of)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    slots.forEach((slot, index) => stmt.run(ownedId, index, slot.itemId, slot.level ?? 0, slot.quality ?? null, asOf));
  });
  run();
}

export function listContainerSlots(db: Db, ownedId: number): ContainerSlotRow[] {
  return db
    .prepare(
      `SELECT cs.*, i.name AS artifact_name, i.rank AS artifact_rank, ic.path AS artifact_icon
       FROM container_slot cs
       JOIN item i ON i.id = cs.artifact_item_id
       LEFT JOIN icon ic ON ic.item_id = cs.artifact_item_id
       WHERE cs.container_owned_id = ? ORDER BY cs.slot`,
    )
    .all(ownedId) as ContainerSlotRow[];
}

export function allContainerSlots(db: Db, characterId?: number): Record<number, ContainerSlotRow[]> {
  const sql =
    characterId == null
      ? `SELECT cs.*, i.name AS artifact_name, i.rank AS artifact_rank, ic.path AS artifact_icon
         FROM container_slot cs
         JOIN item i ON i.id = cs.artifact_item_id
         LEFT JOIN icon ic ON ic.item_id = cs.artifact_item_id
         ORDER BY cs.container_owned_id, cs.slot`
      : `SELECT cs.*, i.name AS artifact_name, i.rank AS artifact_rank, ic.path AS artifact_icon
         FROM container_slot cs
         JOIN item i ON i.id = cs.artifact_item_id
         LEFT JOIN icon ic ON ic.item_id = cs.artifact_item_id
         JOIN owned_item o ON o.id = cs.container_owned_id
         WHERE o.character_id = ?
         ORDER BY cs.container_owned_id, cs.slot`;
  const rows = (characterId == null ? db.prepare(sql).all() : db.prepare(sql).all(characterId)) as ContainerSlotRow[];
  const out: Record<number, ContainerSlotRow[]> = {};
  for (const row of rows) (out[row.container_owned_id] ||= []).push(row);
  return out;
}
