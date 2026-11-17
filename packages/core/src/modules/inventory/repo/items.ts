import type { Db } from '../../../platform/db/index.js';

export interface InventoryItemRow {
  id: number;
  character_id: number;
  item_id: number;
  kind: string;
  level: number;
  quality: string | null;
  rarity_pct: number | null;
  rarity_tier: string | null;
  skin_item_id: number | null;
  qty: number;
  note: string | null;
  display_name: string | null;
  role: string | null;
  slot: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryItemJoined extends InventoryItemRow {
  item_name: string;
  item_name_en: string | null;
  category: string | null;
  item_rank: string | null;
  item_slot: string | null;
  item_weight: number | null;
  item_icon: string | null;
  external_id: string;
  skin_name: string | null;
}

export interface InventoryItemInput {
  characterId: number;
  itemId: number;
  kind: string;
  level?: number;
  quality?: string | null;
  rarityPct?: number | null;
  rarityTier?: string | null;
  skinItemId?: number | null;
  qty?: number;
  note?: string | null;
  displayName?: string | null;
  role?: string | null;
  slot?: string | null;
}

export function insertInventoryItem(db: Db, input: InventoryItemInput): number {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO inventory_item
        (character_id, item_id, kind, level, quality, rarity_pct, rarity_tier, skin_item_id, qty, note,
         display_name, role, slot, created_at, updated_at)
       VALUES (@character_id, @item_id, @kind, @level, @quality, @rarity_pct, @rarity_tier, @skin_item_id, @qty,
         @note, @display_name, @role, @slot, @created_at, @updated_at)`,
    )
    .run({
      character_id: input.characterId,
      item_id: input.itemId,
      kind: input.kind,
      level: input.level ?? 0,
      quality: input.quality ?? null,
      rarity_pct: input.rarityPct ?? null,
      rarity_tier: input.rarityTier ?? null,
      skin_item_id: input.skinItemId ?? null,
      qty: Math.max(1, Math.trunc(input.qty ?? 1)),
      note: input.note ?? null,
      display_name: input.displayName ?? null,
      role: input.role ?? null,
      slot: input.slot ?? null,
      created_at: now,
      updated_at: now,
    });
  return Number(info.lastInsertRowid);
}

const JOIN_COLUMNS = `
  o.*,
  i.name AS item_name, i.name_en AS item_name_en, i.category AS category,
  i.rank AS item_rank, i.slot AS item_slot, i.weight AS item_weight,
  ic.path AS item_icon, i.external_id AS external_id, s.name AS skin_name`;

const JOIN_TABLES = `
  FROM inventory_item o
  JOIN item i ON i.id = o.item_id
  LEFT JOIN icon ic ON ic.item_id = o.item_id
  LEFT JOIN item s ON s.id = o.skin_item_id`;

export function getInventoryItem(db: Db, id: number): InventoryItemJoined | null {
  return (
    (db.prepare(`SELECT ${JOIN_COLUMNS} ${JOIN_TABLES} WHERE o.id = ?`).get(id) as InventoryItemJoined | undefined) ??
    null
  );
}

export function listInventoryItems(
  db: Db,
  characterId: number,
  filter: { kind?: string; location?: string; storageId?: number } = {},
): InventoryItemJoined[] {
  const where = ['o.character_id = @characterId'];
  if (filter.kind) where.push('o.kind = @kind');
  if (filter.location) where.push('p.location = @location');
  if (filter.storageId != null) where.push('p.storage_id = @storageId');
  return db
    .prepare(
      `SELECT ${JOIN_COLUMNS} ${JOIN_TABLES}
       LEFT JOIN item_placement p ON p.item_id = o.id
       WHERE ${where.join(' AND ')}
       ORDER BY o.kind, i.name_norm, o.id`,
    )
    .all({
      characterId,
      kind: filter.kind ?? null,
      location: filter.location ?? null,
      storageId: filter.storageId ?? null,
    }) as InventoryItemJoined[];
}

export function updateInventoryItemRow(
  db: Db,
  id: number,
  patch: Partial<
    Pick<
      InventoryItemRow,
      'level' | 'quality' | 'rarity_pct' | 'rarity_tier' | 'skin_item_id' | 'qty' | 'note' | 'display_name' | 'role' | 'slot'
    >
  >,
): void {
  const changes: Record<string, unknown> = {};
  for (const column of [
    'level',
    'quality',
    'rarity_pct',
    'rarity_tier',
    'skin_item_id',
    'qty',
    'note',
    'display_name',
    'role',
    'slot',
  ] as const) {
    if (patch[column] !== undefined) changes[column] = patch[column];
  }
  if (!Object.keys(changes).length) return;
  if (changes.qty != null) changes.qty = Math.max(1, Math.trunc(Number(changes.qty)));
  const sets = Object.keys(changes)
    .map((column) => `${column} = @${column}`)
    .join(', ');
  db.prepare(`UPDATE inventory_item SET ${sets}, updated_at = @updated_at WHERE id = @id`).run({
    ...changes,
    updated_at: new Date().toISOString(),
    id,
  });
}

export function deleteInventoryItemRow(db: Db, id: number): void {
  db.prepare(`DELETE FROM inventory_item WHERE id = ?`).run(id);
}

/** Restores an instance snapshot with its original id and timestamps. */
export function restoreInventoryItemRow(db: Db, row: InventoryItemRow): void {
  db.prepare(
    `INSERT INTO inventory_item
      (id, character_id, item_id, kind, level, quality, rarity_pct, rarity_tier, skin_item_id, qty, note,
       display_name, role, slot, created_at, updated_at)
     VALUES
      (@id, @character_id, @item_id, @kind, @level, @quality, @rarity_pct, @rarity_tier, @skin_item_id, @qty,
       @note, @display_name, @role, @slot, @created_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       character_id = excluded.character_id,
       item_id = excluded.item_id,
       kind = excluded.kind,
       level = excluded.level,
       quality = excluded.quality,
       rarity_pct = excluded.rarity_pct,
       rarity_tier = excluded.rarity_tier,
       skin_item_id = excluded.skin_item_id,
       qty = excluded.qty,
       note = excluded.note,
       display_name = excluded.display_name,
       role = excluded.role,
       slot = excluded.slot,
       updated_at = excluded.updated_at`,
  ).run(row);
}
