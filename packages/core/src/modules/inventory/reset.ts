import type { Db } from '../../platform/db/index.js';
import { norm } from '@profile/shared';
import { WriteError } from '../../platform/journal/index.js';
import * as repo from './repo/index.js';
import { nextOverflowPlacement, packIntoOverflow } from './write/overflow.js';
import { itemSize } from './write/placement.js';
import { findCollision, itemRect } from './layout/index.js';
import { inventorySnapshot } from './write/storage.js';
import { INTAKE_GRID_HEIGHT, INVENTORY_GRID_HEIGHT, INVENTORY_GRID_WIDTH } from '@profile/shared/contracts';

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
 * its default inventory and intake storages (spec §15); returns what was removed.
 */
export function clearInventoryTx(db: Db, characterId: number): Record<string, unknown> {
  const snapshot = inventoryCleanupSnapshot(db, characterId);
  db.prepare(`DELETE FROM item_placement WHERE character_id = ?`).run(characterId);
  db.prepare(`DELETE FROM inventory_item WHERE character_id = ?`).run(characterId);
  db.prepare(`DELETE FROM storage WHERE character_id = ?`).run(characterId);
  repo.insertStorage(db, { characterId, kind: 'inventory', name: 'Inventory', width: INVENTORY_GRID_WIDTH, height: INVENTORY_GRID_HEIGHT });
  repo.insertStorage(db, { characterId, kind: 'overflow', name: 'Intake', width: INVENTORY_GRID_WIDTH, height: INTAKE_GRID_HEIGHT });
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
  virtual?: boolean;
  displayName: string | null;
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
  // Rotation no longer exists: a legacy snapshot restores into the intake unrotated instead
  // of writing a footprint the current item can never occupy.
  if (location === 'grid' && snapshot.rotated === true) {
    const row = repo.getInventoryItem(db, itemId);
    if (row) {
      const intakeId = ensureIntakeRow(db, characterId);
      const [spot] = packIntoOverflow(db, characterId, [{ id: itemId, size: itemSize(db, row) }]);
      if (spot) {
        repo.upsertPlacement(db, {
          itemId,
          characterId,
          location: 'grid',
          storageId: intakeId,
          x: spot.x,
          y: spot.y,
        });
        return;
      }
    }
  }
  repo.upsertPlacement(db, {
    itemId,
    characterId,
    location,
    storageId: snapshot.storageId as number | null,
    x: snapshot.x as number | null,
    y: snapshot.y as number | null,
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
    is_virtual: item.virtual ? 1 : 0,
    display_name: item.displayName,
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
    is_virtual: item.virtual ? 1 : 0,
    display_name: item.displayName,
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

/** Removes an instance created by a write being rolled back, freeing its children into intake. */
export function deleteInventoryItemTx(db: Db, id: number): void {
  const row = repo.getInventoryItem(db, id);
  if (!row) return;
  for (const placement of repo.listPlacements(db, row.character_id)) {
    if (placement.container_item_id === id || placement.weapon_item_id === id) {
      const child = repo.getInventoryItem(db, placement.item_id);
      if (child) sendToIntake(db, row.character_id, child.id, itemSize(db, child));
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
  // The occupant took the mover's old slot, which the unique placement indexes now
  // guard: free it before the mover returns, then put the occupant back last.
  if (produced.swapped) repo.deletePlacement(db, produced.swapped.itemId);
  if (moved.placement) restorePlacementSnapshot(db, moved.id, moved.placement, characterId);
  if (produced.swapped && produced.placement) {
    restorePlacementSnapshot(db, produced.swapped.itemId, produced.placement, characterId);
  }
}

interface StorageSnapshot {
  id: number;
  kind: 'inventory' | 'stash' | 'overflow';
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
    name_norm: norm(storage.name),
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

/** Removes a storage created by a write being rolled back, returning its items to intake. */
export function deleteStorageTx(db: Db, id: number): void {
  const storage = repo.getStorage(db, id);
  if (!storage || storage.kind !== 'stash') return;
  const placements = repo.listStoragePlacements(db, id);
  if (placements.length) {
    const intakeId = ensureIntakeRow(db, storage.character_id);
    const packed = packIntoOverflow(
      db,
      storage.character_id,
      placements.map((placement) => ({
        id: placement.item_id,
        size: itemSize(db, repo.getInventoryItem(db, placement.item_id)!),
      })),
    );
    for (const entry of packed) {
      repo.upsertPlacement(db, {
        itemId: entry.id,
        characterId: storage.character_id,
        location: 'grid',
        storageId: intakeId,
        x: entry.x,
        y: entry.y,
      });
    }
  }
  repo.deleteStorageRow(db, id);
}

/** A rollback runs inside the event transaction, so a missing intake row is repaired silently. */
function ensureIntakeRow(db: Db, characterId: number): number {
  const existing = repo.getOverflowStorage(db, characterId);
  if (existing) return existing.id;
  return repo.insertStorage(db, {
    characterId,
    kind: 'overflow',
    name: 'Intake',
    width: INVENTORY_GRID_WIDTH,
    height: INTAKE_GRID_HEIGHT,
    sortOrder: 0,
  });
}

/** Places one item in intake without logging an event of its own. */
function sendToIntake(db: Db, characterId: number, itemId: number, size: ReturnType<typeof itemSize>): void {
  ensureIntakeRow(db, characterId);
  const spot = nextOverflowPlacement(db, characterId, size);
  repo.upsertPlacement(db, {
    itemId,
    characterId,
    location: 'grid',
    storageId: spot.storageId,
    x: spot.x,
    y: spot.y,
  });
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
    const displaced = repo.getInventoryItem(db, current.item_id);
    if (displaced) sendToIntake(db, characterId, displaced.id, itemSize(db, displaced));
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
  const freed: number[] = [];
  for (const placement of repo.listPlacements(db, characterId)) {
    if (placement.location === 'container' && placement.container_item_id === fill.containerItemId) {
      freed.push(placement.item_id);
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
  // An artifact the event does not account for still has to land somewhere: intake.
  for (const itemId of freed) {
    if (repo.getPlacement(db, itemId)?.location !== 'loose') continue;
    const row = repo.getInventoryItem(db, itemId);
    if (row) sendToIntake(db, characterId, row.id, itemSize(db, row));
  }
}

/** Puts auto-arranged items back where they came from, or into intake for legacy events. */
export function restoreAutoArrangeTx(
  db: Db,
  snapshot: Record<string, unknown>,
  characterId: number,
): void {
  const sources = snapshot.sources as PlacementEntry[] | undefined;
  if (sources) {
    for (const entry of sources) {
      restorePlacementSnapshot(db, entry.itemId, entry.placement, characterId);
    }
    return;
  }
  for (const itemId of (snapshot.loose as number[] | undefined) ?? []) {
    const row = repo.getInventoryItem(db, itemId);
    if (row) sendToIntake(db, characterId, row.id, itemSize(db, row));
  }
}


/** Tidy-up rollback restores every placement in the storage from its `before` snapshot. */
export function restoreTidyTx(
  db: Db,
  snapshot: Record<string, unknown>,
  characterId: number,
): void {
  const entries = (snapshot.placements as PlacementEntry[] | undefined) ?? [];
  const storageId = Number(snapshot.storageId);
  // Park every snapshot item first so the restore order cannot collide with a snapshot
  // item still sitting on the target cell.
  repo.parkPlacements(db, entries.map((entry) => entry.itemId));
  // A cell written after the event is not part of the snapshot: restoring onto it would
  // overwrite foreign state (or trip the unique index), so refuse with a typed conflict.
  if (entries.length && Number.isInteger(storageId)) {
    const snapshotIds = new Set(entries.map((entry) => entry.itemId));
    const foreign = repo
      .listStoragePlacements(db, storageId)
      .filter((placement) => !snapshotIds.has(placement.item_id) && placement.x != null && placement.y != null)
      .flatMap((placement) => {
        const row = repo.getInventoryItem(db, placement.item_id);
        if (!row || placement.x == null || placement.y == null) return [];
        return [itemRect(placement.x, placement.y, itemSize(db, row))];
      });
    for (const entry of entries) {
      const target = entry.placement;
      if (target.location !== 'grid' || Number(target.storageId) !== storageId) continue;
      if (target.x == null || target.y == null) continue;
      const row = repo.getInventoryItem(db, entry.itemId);
      if (!row) continue;
      const rect = itemRect(Number(target.x), Number(target.y), itemSize(db, row));
      if (findCollision(rect, foreign)) {
        throw new WriteError(
          409,
          'ROLLBACK_CONFLICT',
          'The storage changed after this event; move the new items out and roll back again',
        );
      }
    }
  }
  for (const entry of entries) {
    restorePlacementSnapshot(db, entry.itemId, entry.placement, characterId);
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
