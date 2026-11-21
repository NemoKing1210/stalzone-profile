import type { Db } from '../../../platform/db/index.js';

export type PlacementLocation = 'grid' | 'equipment' | 'container' | 'weapon_module' | 'loose';

export interface PlacementRow {
  item_id: number;
  character_id: number;
  location: PlacementLocation;
  storage_id: number | null;
  x: number | null;
  y: number | null;
  equipment_slot: string | null;
  container_item_id: number | null;
  container_slot: number | null;
  weapon_item_id: number | null;
  module_slot: string | null;
  verified: number;
  updated_at: string;
}

export interface PlacementInput {
  itemId: number;
  characterId: number;
  location: PlacementLocation;
  storageId?: number | null;
  x?: number | null;
  y?: number | null;
  equipmentSlot?: string | null;
  containerItemId?: number | null;
  containerSlot?: number | null;
  weaponItemId?: number | null;
  moduleSlot?: string | null;
  verified?: boolean;
}

export function upsertPlacement(db: Db, input: PlacementInput): void {
  db.prepare(
    `INSERT INTO item_placement
      (item_id, character_id, location, storage_id, x, y, equipment_slot,
       container_item_id, container_slot, weapon_item_id, module_slot, verified, updated_at)
     VALUES
      (@item_id, @character_id, @location, @storage_id, @x, @y, @equipment_slot,
       @container_item_id, @container_slot, @weapon_item_id, @module_slot, @verified, @updated_at)
     ON CONFLICT(item_id) DO UPDATE SET
       character_id = excluded.character_id,
       location = excluded.location,
       storage_id = excluded.storage_id,
       x = excluded.x,
       y = excluded.y,
       equipment_slot = excluded.equipment_slot,
       container_item_id = excluded.container_item_id,
       container_slot = excluded.container_slot,
       weapon_item_id = excluded.weapon_item_id,
       module_slot = excluded.module_slot,
       verified = excluded.verified,
       updated_at = excluded.updated_at`,
  ).run({
    item_id: input.itemId,
    character_id: input.characterId,
    location: input.location,
    storage_id: input.storageId ?? null,
    x: input.x ?? null,
    y: input.y ?? null,
    equipment_slot: input.equipmentSlot ?? null,
    container_item_id: input.containerItemId ?? null,
    container_slot: input.containerSlot ?? null,
    weapon_item_id: input.weaponItemId ?? null,
    module_slot: input.moduleSlot ?? null,
    verified: input.verified === false ? 0 : 1,
    updated_at: new Date().toISOString(),
  });
}

export function getPlacement(db: Db, itemId: number): PlacementRow | null {
  return (
    (db.prepare(`SELECT * FROM item_placement WHERE item_id = ?`).get(itemId) as PlacementRow | undefined) ?? null
  );
}

export function listPlacements(db: Db, characterId: number): PlacementRow[] {
  return db
    .prepare(`SELECT * FROM item_placement WHERE character_id = ? ORDER BY item_id`)
    .all(characterId) as PlacementRow[];
}

export function listStoragePlacements(db: Db, storageId: number): PlacementRow[] {
  return db
    .prepare(`SELECT * FROM item_placement WHERE storage_id = ? AND location = 'grid' ORDER BY y, x`)
    .all(storageId) as PlacementRow[];
}

export function deletePlacement(db: Db, itemId: number): void {
  db.prepare(`DELETE FROM item_placement WHERE item_id = ?`).run(itemId);
}

/** Restores a placement row exactly as it was, including its `updated_at`. */
export function restorePlacementRow(db: Db, row: PlacementRow): void {
  db.prepare(
    `INSERT INTO item_placement
      (item_id, character_id, location, storage_id, x, y, equipment_slot,
       container_item_id, container_slot, weapon_item_id, module_slot, verified, updated_at)
     VALUES
      (@item_id, @character_id, @location, @storage_id, @x, @y, @equipment_slot,
       @container_item_id, @container_slot, @weapon_item_id, @module_slot, @verified, @updated_at)
     ON CONFLICT(item_id) DO UPDATE SET
       character_id = excluded.character_id,
       location = excluded.location,
       storage_id = excluded.storage_id,
       x = excluded.x,
       y = excluded.y,
       equipment_slot = excluded.equipment_slot,
       container_item_id = excluded.container_item_id,
       container_slot = excluded.container_slot,
       weapon_item_id = excluded.weapon_item_id,
       module_slot = excluded.module_slot,
       verified = excluded.verified,
       updated_at = excluded.updated_at`,
  ).run(row);
}

/**
 * Frees the grid cells of the given items inside the caller's transaction: every row becomes
 * a loose placement with no storage and no origin. Bulk rewrites (tidy, and its rollback)
 * park all moved rows first, so the final positions can be written in any order without
 * tripping the unique grid-origin index. Parking never survives the transaction.
 */
export function parkPlacements(db: Db, itemIds: readonly number[]): void {
  if (!itemIds.length) return;
  const park = db.prepare(
    `UPDATE item_placement
        SET location = 'loose', storage_id = NULL, x = NULL, y = NULL, updated_at = ?
      WHERE item_id = ?`,
  );
  const at = new Date().toISOString();
  for (const itemId of itemIds) park.run(at, itemId);
}
