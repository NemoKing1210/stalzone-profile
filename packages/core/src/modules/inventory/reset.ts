import type { Db } from '../../platform/db/index.js';
import { WriteError } from '../../platform/journal/index.js';
import * as repo from './repo/index.js';
import { inventorySnapshot } from './write/storage.js';

/**
 * Reset, rollback and restore helpers for the instance inventory.
 *
 * Two snapshot shapes meet here:
 * - the cleanup snapshot holds raw rows with their ids and timestamps, so a
 *   cleanup rollback restores an identical database state;
 * - write events hold camelCase item/placement snapshots, so rolling back one
 *   write restores exactly what that write touched.
 */

const now = () => new Date().toISOString();

/** The whole new-model inventory of one character, in a stable order. */
export function inventoryCleanupSnapshot(db: Db, characterId: number): Record<string, unknown> {
  return inventorySnapshot(db, characterId);
}

/**
 * Deletes every storage, instance and placement of the character and recreates
 * its default inventory storage (spec §15); returns what was removed.
 */
export function clearInventoryTx(db: Db, characterId: number): Record<string, unknown> {
  const snapshot = inventoryCleanupSnapshot(db, characterId);
  db.prepare(`DELETE FROM item_placement WHERE character_id = ?`).run(characterId);
  db.prepare(`DELETE FROM inventory_item WHERE character_id = ?`).run(characterId);
  db.prepare(`DELETE FROM storage WHERE character_id = ?`).run(characterId);
  repo.insertStorage(db, { characterId, kind: 'inventory', name: 'Inventory', width: 8, height: 8 });
  return snapshot;
}

/** Restores the rows of a cleanup or character-delete snapshot under their original ids. */
export function restoreInventoryTx(
  db: Db,
  snapshots: Record<string, unknown>,
  characterId: number,
): void {
  // A clear recreates the default inventory storage; the snapshot replaces it.
  db.prepare(`DELETE FROM item_placement WHERE character_id = ?`).run(characterId);
  db.prepare(`DELETE FROM inventory_item WHERE character_id = ?`).run(characterId);
  db.prepare(`DELETE FROM storage WHERE character_id = ?`).run(characterId);
  for (const row of (snapshots.storages as repo.StorageRow[] | undefined) ?? []) {
    repo.restoreStorageRow(db, { ...row, character_id: characterId });
  }
  for (const row of (snapshots.items as repo.InventoryItemRow[] | undefined) ?? []) {
    repo.restoreInventoryItemRow(db, { ...row, character_id: characterId });
  }
  for (const row of (snapshots.containerData as repo.ContainerDataRow[] | undefined) ?? []) {
    repo.restoreContainerDataRow(db, row);
  }
  for (const row of (snapshots.layouts as repo.ItemLayoutRow[] | undefined) ?? []) {
    repo.restoreItemLayoutRow(db, row);
  }
  for (const row of (snapshots.placements as repo.PlacementRow[] | undefined) ?? []) {
    repo.restorePlacementRow(db, { ...row, character_id: characterId });
  }
}

interface ItemSnapshot {
  id: number;
  itemId: number;
  kind: string;
  level: number;
  quality: string | null;
  rarityPct: number | null;
  rarityTier: string | null;
  skinItemId: number | null;
  qty: number;
  note: string | null;
  displayName: string | null;
  role: string | null;
  slot: string | null;
  placement: Record<string, unknown> | null;
  container: Record<string, unknown> | null;
  children?: { itemId: number; placement: Record<string, unknown> }[];
}

type PlacementEntry = { itemId: number; placement: Record<string, unknown> };

/** Applies a placement snapshot to one item. */
function restorePlacementSnapshot(
  db: Db,
  itemId: number,
  snapshot: Record<string, unknown>,
  characterId: number,
): void {
  const location = String(snapshot.location ?? 'loose') as repo.PlacementLocation;
  repo.upsertPlacement(db, {
    itemId,
    characterId,
    location,
    storageId: snapshot.storageId as number | null,
    x: snapshot.x as number | null,
    y: snapshot.y as number | null,
    rotated: Boolean(snapshot.rotated),
    equipmentSlot: snapshot.slot as string | null,
    containerItemId: snapshot.containerItemId as number | null,
    containerSlot: snapshot.slotIndex as number | null,
    weaponItemId: snapshot.weaponItemId as number | null,
    moduleSlot: snapshot.moduleSlot as string | null,
    verified: snapshot.verified !== false,
  });
}

function restoreContainerSnapshot(db: Db, itemId: number, container: Record<string, unknown>): void {
  repo.upsertContainerData(db, itemId, {
    type: container.type as string | null,
    shield: container.shield as number | null,
    bonus: container.bonus as string | null,
    protection: container.protection as number | null,
    slots: container.slots as number | null,
    eff: container.eff as number | null,
  });
}

/** Re-applies the fields of an item snapshot; the instance must still exist. */
export function updateInventoryTx(db: Db, snapshot: Record<string, unknown>): void {
  const item = snapshot as unknown as ItemSnapshot;
  repo.updateInventoryItemRow(db, item.id, {
    level: item.level,
    quality: item.quality,
    rarity_pct: item.rarityPct,
    rarity_tier: item.rarityTier,
    skin_item_id: item.skinItemId,
    qty: item.qty,
    note: item.note,
    display_name: item.displayName,
    role: item.role,
    slot: item.slot,
  });
  if (item.container) restoreContainerSnapshot(db, item.id, item.container);
  else repo.deleteContainerData(db, item.id);
}

/** Recreates a deleted instance, its placement, container data and displaced children. */
export function restoreInventoryItemTx(
  db: Db,
  snapshot: Record<string, unknown>,
  characterId: number,
): void {
  const item = snapshot as unknown as ItemSnapshot;
  const stamp = now();
  repo.restoreInventoryItemRow(db, {
    id: item.id,
    character_id: characterId,
    item_id: item.itemId,
    kind: item.kind,
    level: item.level,
    quality: item.quality,
    rarity_pct: item.rarityPct,
    rarity_tier: item.rarityTier,
    skin_item_id: item.skinItemId,
    qty: item.qty,
    note: item.note,
    display_name: item.displayName,
    role: item.role,
    slot: item.slot,
    created_at: stamp,
    updated_at: stamp,
  });
  if (item.container) restoreContainerSnapshot(db, item.id, item.container);
  if (item.placement) restorePlacementSnapshot(db, item.id, item.placement, characterId);
  for (const entry of item.children ?? []) {
    restorePlacementSnapshot(db, entry.itemId, entry.placement, characterId);
  }
}

/** Removes an instance created by a write being rolled back, freeing its children. */
export function deleteInventoryItemTx(db: Db, id: number): void {
  const row = repo.getInventoryItem(db, id);
  if (!row) return;
  for (const placement of repo.listPlacements(db, row.character_id)) {
    if (placement.container_item_id === id || placement.weapon_item_id === id) {
      repo.upsertPlacement(db, { itemId: placement.item_id, characterId: row.character_id, location: 'loose' });
    }
  }
  repo.deleteInventoryItemRow(db, id);
}

interface MoveSnapshot {
  id: number;
  placement: Record<string, unknown> | null;
  swapped?: { itemId: number; placement: Record<string, unknown> };
}

/**
 * Puts the moved item back and returns the swapped occupant to the slot it held.
 * The occupant's old slot is the one the moved item took, so `after.placement`
 * is the occupant's previous placement.
 */
export function restoreMoveTx(
  db: Db,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  characterId: number,
): void {
  const moved = before as unknown as MoveSnapshot;
  const produced = after as unknown as MoveSnapshot;
  if (moved.placement) restorePlacementSnapshot(db, moved.id, moved.placement, characterId);
  if (produced.swapped && produced.placement) {
    restorePlacementSnapshot(db, produced.swapped.itemId, produced.placement, characterId);
  }
}

interface StorageSnapshot {
  id: number;
  kind: 'inventory' | 'stash';
  name: string;
  width: number;
  height: number;
  maxWeight: number | null;
  sortOrder: number;
  placements?: PlacementEntry[];
}

/** Recreates a deleted storage with its original id and puts its items back on the grid. */
export function restoreStorageTx(db: Db, snapshot: Record<string, unknown>, characterId: number): void {
  const storage = snapshot as unknown as StorageSnapshot;
  const stamp = now();
  repo.restoreStorageRow(db, {
    id: storage.id,
    character_id: characterId,
    kind: storage.kind,
    name: storage.name,
    name_norm: storage.name.trim().toLocaleLowerCase('ru'),
    width: storage.width,
    height: storage.height,
    max_weight: storage.maxWeight,
    sort_order: storage.sortOrder,
    created_at: stamp,
    updated_at: stamp,
  });
  for (const entry of storage.placements ?? []) {
    restorePlacementSnapshot(db, entry.itemId, entry.placement, characterId);
  }
}

/** Removes a storage created by a write being rolled back, returning its items to loose. */
export function deleteStorageTx(db: Db, id: number): void {
  const storage = repo.getStorage(db, id);
  if (!storage) return;
  for (const placement of repo.listStoragePlacements(db, id)) {
    repo.upsertPlacement(db, { itemId: placement.item_id, characterId: storage.character_id, location: 'loose' });
  }
  repo.deleteStorageRow(db, id);
}

/** Re-applies the fields of a storage snapshot. */
export function updateStorageTx(db: Db, snapshot: Record<string, unknown>): void {
  const storage = snapshot as unknown as StorageSnapshot;
  repo.updateStorageRow(db, storage.id, {
    name: storage.name,
    width: storage.width,
    height: storage.height,
    max_weight: storage.maxWeight,
    sort_order: storage.sortOrder,
  });
}

interface ModuleSnapshot {
  weaponItemId: number;
  slot: string;
  attachmentItemId: number | null;
  attachment: { placement: Record<string, unknown> } | null;
  incomingPlacement: Record<string, unknown> | null;
}

/** Puts a weapon module slot back into the state recorded in a module event. */
export function restoreWeaponModuleTx(
  db: Db,
  before: Record<string, unknown>,
  characterId: number,
): void {
  const module = before as unknown as ModuleSnapshot;
  const current = repo
    .listPlacements(db, characterId)
    .find(
      (placement) =>
        placement.location === 'weapon_module' &&
        placement.weapon_item_id === module.weaponItemId &&
        placement.module_slot === module.slot,
    );

  if (module.incomingPlacement) {
    const installed = current?.item_id ?? null;
    if (installed != null) {
      restorePlacementSnapshot(db, installed, module.incomingPlacement, characterId);
    }
  } else if (current && current.item_id !== module.attachmentItemId) {
    repo.upsertPlacement(db, { itemId: current.item_id, characterId, location: 'loose' });
  }

  if (module.attachmentItemId != null) {
    if (module.attachment) {
      restorePlacementSnapshot(db, module.attachmentItemId, module.attachment.placement, characterId);
    } else {
      const attachment = repo.getInventoryItem(db, module.attachmentItemId);
      if (!attachment) throw new WriteError(404, 'ITEM_NOT_FOUND', 'The attachment no longer exists');
      repo.upsertPlacement(db, {
        itemId: module.attachmentItemId,
        characterId,
        location: 'weapon_module',
        weaponItemId: module.weaponItemId,
        moduleSlot: module.slot,
        verified: true,
      });
    }
  }
}

interface FillSnapshot {
  containerItemId: number;
  slots: { slot: number; itemId: number | null }[];
  /** Where the artifacts that came from outside the container were before the fill. */
  incoming?: PlacementEntry[];
}

/** Restores the slots recorded in a container fill event. */
export function restoreInventoryFillTx(
  db: Db,
  snapshot: Record<string, unknown>,
  characterId: number,
): void {
  const fill = snapshot as unknown as FillSnapshot;
  // Free the container first: the forward write may have reordered retained artifacts
  // or pulled in artifacts that now occupy other slots.
  for (const placement of repo.listPlacements(db, characterId)) {
    if (placement.location === 'container' && placement.container_item_id === fill.containerItemId) {
      repo.upsertPlacement(db, { itemId: placement.item_id, characterId, location: 'loose' });
    }
  }
  for (const entry of fill.incoming ?? []) {
    restorePlacementSnapshot(db, entry.itemId, entry.placement, characterId);
  }
  for (const entry of fill.slots) {
    if (entry.itemId == null) continue;
    repo.upsertPlacement(db, {
      itemId: entry.itemId,
      characterId,
      location: 'container',
      containerItemId: fill.containerItemId,
      containerSlot: entry.slot,
    });
  }
}

/** Returns the items an auto-arrange packed back to the loose tray. */
export function restoreAutoArrangeTx(
  db: Db,
  snapshot: Record<string, unknown>,
  characterId: number,
): void {
  for (const entry of (snapshot.placed as { id: number }[] | undefined) ?? []) {
    repo.upsertPlacement(db, { itemId: entry.id, characterId, location: 'loose' });
  }
}

/** Puts a catalog item's layout override back, or removes it when there was none. */
export function restoreItemLayoutTx(
  db: Db,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): void {
  if (before) {
    repo.upsertItemLayout(db, Number(before.itemId), {
      width: Number(before.width),
      height: Number(before.height),
      weight: before.weight as number | null,
    });
    return;
  }
  if (after) repo.deleteItemLayout(db, Number(after.itemId));
}
