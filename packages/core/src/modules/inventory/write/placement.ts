import { acceptsEquipment } from '@profile/shared/contracts';
import type { PlacementTarget } from '@profile/shared/contracts';
import { modificationSlotFor } from '@profile/shared/modifications';
import type { Db } from '../../../platform/db/index.js';
import { logEvent, withTransaction, WriteError, type WriteResult } from '../../../platform/journal/index.js';
import { statValueBase } from '../../catalog/index.js';
import {
  findCollision,
  fits,
  itemRect,
  resolveSize,
  type Rect,
  type Size,
} from '../layout/index.js';
import * as repo from '../repo/index.js';
import { ensureOverflowStorage, nextOverflowPlacement } from './overflow.js';
import { inventoryItemSnapshot, placementSnapshot } from './snapshot.js';

export const EQUIPMENT_SLOTS = [
  'primary',
  'secondary',
  'melee',
  'armor',
  'backpack',
  'container',
  'quick1',
  'quick2',
  'quick3',
  'quick4',
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export function isEquipmentSlot(value: string): value is EquipmentSlot {
  return (EQUIPMENT_SLOTS as readonly string[]).includes(value);
}

/** The fields target validation needs; an inventory row satisfies it, and so does a draft. */
export interface MovableItem {
  id: number;
  item_id: number;
  character_id: number;
  kind: string;
  category: string | null;
  level: number;
}

export function itemSize(db: Db, row: MovableItem): Size {
  const layout = repo.getItemLayout(db, row.item_id);
  return resolveSize(row.kind, row.category, layout ? { width: layout.width, height: layout.height } : null);
}

export function effectiveContainerSlots(db: Db, row: MovableItem): number | null {
  const data = repo.getContainerData(db, row.id);
  if (data?.slots != null) return data.slots;
  return statValueBase(db, row.item_id, 'container.slots', row.level);
}

function loadItem(db: Db, itemId: number): repo.InventoryItemJoined {
  const row = repo.getInventoryItem(db, itemId);
  if (!row) throw new WriteError(404, 'ITEM_NOT_FOUND', 'Inventory item not found');
  return row;
}

export function placementInputSnapshot(next: repo.PlacementInput): Record<string, unknown> {
  return {
    location: next.location,
    storageId: next.storageId ?? null,
    x: next.x ?? null,
    y: next.y ?? null,
    slot: next.equipmentSlot ?? null,
    containerItemId: next.containerItemId ?? null,
    slotIndex: next.containerSlot ?? null,
    weaponItemId: next.weaponItemId ?? null,
    modificationSlot: next.modificationSlot ?? null,
    verified: next.verified !== false,
  };
}

function placementRect(db: Db, row: repo.InventoryItemJoined, placement: repo.PlacementRow): Rect | null {
  if (placement.x == null || placement.y == null) return null;
  return itemRect(placement.x, placement.y, itemSize(db, row));
}

function toPlacement(
  row: MovableItem,
  target: PlacementTarget,
  verified: boolean,
): repo.PlacementInput {
  if (target.location === 'grid') {
    return {
      itemId: row.id,
      characterId: row.character_id,
      location: 'grid',
      storageId: target.storageId,
      x: target.x,
      y: target.y,
    };
  }
  if (target.location === 'equipment') {
    return {
      itemId: row.id,
      characterId: row.character_id,
      location: 'equipment',
      equipmentSlot: target.slot,
    };
  }
  if (target.location === 'container') {
    return {
      itemId: row.id,
      characterId: row.character_id,
      location: 'container',
      containerItemId: target.containerItemId,
      containerSlot: target.slot,
    };
  }
  return {
    itemId: row.id,
    characterId: row.character_id,
    location: 'weapon_modification',
    weaponItemId: target.weaponItemId,
    modificationSlot: target.slot,
    verified,
  };
}

function samePlacement(current: repo.PlacementRow | null, next: repo.PlacementInput): boolean {
  if (!current) return false;
  return (
    current.location === next.location &&
    current.storage_id === (next.storageId ?? null) &&
    current.x === (next.x ?? null) &&
    current.y === (next.y ?? null) &&
    current.equipment_slot === (next.equipmentSlot ?? null) &&
    current.container_item_id === (next.containerItemId ?? null) &&
    current.container_slot === (next.containerSlot ?? null) &&
    current.weapon_item_id === (next.weaponItemId ?? null) &&
    current.modification_slot === (next.modificationSlot ?? null) &&
    current.verified === (next.verified === false ? 0 : 1)
  );
}

function targetDescription(target: PlacementTarget): string {
  if (target.location === 'grid') return `storage #${target.storageId} at ${target.x},${target.y}`;
  if (target.location === 'equipment') return `slot ${target.slot}`;
  if (target.location === 'container') return `container slot ${target.slot}`;
  return `modification ${target.slot}`;
}

function validateModificationInstall(
  db: Db,
  modification: MovableItem,
  weapon: MovableItem,
  slot: string,
  allowUnverified: boolean,
): boolean {
  if (modification.kind !== 'modification') {
    throw new WriteError(422, 'INVALID_PLACEMENT', 'Only a modification can be installed into a weapon slot');
  }
  if (weapon.kind !== 'weapon') {
    throw new WriteError(422, 'NOT_A_WEAPON', 'Modifications attach to a weapon only');
  }
  const derived = modificationSlotFor(modification.category);
  if (derived !== slot) {
    throw new WriteError(422, 'INVALID_PLACEMENT', `This modification belongs to the ${derived} slot`);
  }
  const edges = repo.listCompatForModification(db, modification.item_id);
  if (edges.length > 0) {
    if (!repo.isCompatible(db, modification.item_id, weapon.item_id)) {
      throw new WriteError(409, 'INCOMPATIBLE_MODIFICATION', 'This modification does not fit this weapon', {
        modificationItemId: modification.item_id,
        weaponItemId: weapon.item_id,
      });
    }
    return true;
  }
  if (!allowUnverified) {
    throw new WriteError(409, 'INCOMPATIBLE_MODIFICATION', 'Compatibility is unknown; install it explicitly as unverified', {
      modificationItemId: modification.item_id,
      weaponItemId: weapon.item_id,
      reason: 'unverified',
    });
  }
  return false;
}

/** Validates the location the displaced occupant would move into, before any write. */
function resolveSwapPlacement(
  db: Db,
  occupant: repo.InventoryItemJoined,
  old: repo.PlacementRow | null,
  excludeIds: readonly number[],
): repo.PlacementInput {
  if (!old || old.location === 'loose') {
    throw new WriteError(422, 'INVALID_PLACEMENT', 'The occupant has no safe place to return to');
  }
  if (old.location === 'grid') {
    const storage = old.storage_id == null ? null : repo.getStorage(db, old.storage_id);
    if (!storage || old.x == null || old.y == null) {
      throw new WriteError(422, 'INVALID_PLACEMENT', 'The occupant cannot move to the old grid location');
    }
    if (storage.kind === 'overflow') {
      throw new WriteError(422, 'INVALID_PLACEMENT', 'The occupant has no safe place to return to');
    }
    const rect = itemRect(old.x, old.y, itemSize(db, occupant));
    if (!fits({ width: storage.width, height: storage.height }, rect)) {
      throw new WriteError(409, 'INVALID_PLACEMENT', 'The occupant does not fit the old grid location');
    }
    const others = repo
      .listStoragePlacements(db, storage.id)
      .filter((placement) => !excludeIds.includes(placement.item_id))
      .map((placement) => {
        const row = repo.getInventoryItem(db, placement.item_id);
        return row ? placementRect(db, row, placement) : null;
      })
      .filter((rect): rect is Rect => rect !== null);
    if (findCollision(rect, others)) {
      throw new WriteError(409, 'INVALID_PLACEMENT', 'The old grid location is occupied');
    }
    return {
      itemId: occupant.id,
      characterId: occupant.character_id,
      location: 'grid',
      storageId: storage.id,
      x: old.x,
      y: old.y,
    };
  }
  if (old.location === 'equipment') {
    if (!old.equipment_slot || !isEquipmentSlot(old.equipment_slot) || !acceptsEquipment(old.equipment_slot, occupant)) {
      throw new WriteError(422, 'INVALID_PLACEMENT', 'The occupant does not fit the old equipment slot');
    }
    return {
      itemId: occupant.id,
      characterId: occupant.character_id,
      location: 'equipment',
      equipmentSlot: old.equipment_slot,
    };
  }
  if (old.location === 'container') {
    const containerId = old.container_item_id;
    const slot = old.container_slot;
    if (containerId == null || slot == null) {
      throw new WriteError(422, 'INVALID_PLACEMENT', 'The old container slot is missing');
    }
    const container = repo.getInventoryItem(db, containerId);
    if (!container || container.character_id !== occupant.character_id) {
      throw new WriteError(422, 'INVALID_PLACEMENT', 'The old container is not available');
    }
    if (occupant.kind !== 'artifact') {
      throw new WriteError(422, 'NOT_AN_ARTIFACT', 'Only an artifact fits the old container slot');
    }
    const slots = effectiveContainerSlots(db, container);
    if (slots == null || slot >= slots) {
      throw new WriteError(422, 'CONTAINER_FULL', 'The old container slot is not available');
    }
    return {
      itemId: occupant.id,
      characterId: occupant.character_id,
      location: 'container',
      containerItemId: containerId,
      containerSlot: slot,
    };
  }
  if (old.location === 'weapon_modification') {
    const weaponId = old.weapon_item_id;
    if (weaponId == null || old.modification_slot == null) {
      throw new WriteError(422, 'INVALID_PLACEMENT', 'The old modification slot is missing');
    }
    const weapon = repo.getInventoryItem(db, weaponId);
    if (!weapon || weapon.character_id !== occupant.character_id) {
      throw new WriteError(422, 'INVALID_PLACEMENT', 'The old weapon is not available');
    }
    const verified = validateModificationInstall(db, occupant, weapon, old.modification_slot, true);
    return {
      itemId: occupant.id,
      characterId: occupant.character_id,
      location: 'weapon_modification',
      weaponItemId: weaponId,
      modificationSlot: old.modification_slot,
      verified,
    };
  }
  throw new WriteError(422, 'INVALID_PLACEMENT', 'The occupant cannot move to the old location');
}

export interface TargetResolution {
  next: repo.PlacementInput;
  occupant: { row: repo.InventoryItemJoined; final: repo.PlacementInput } | null;
  verified: boolean;
}

/**
 * Validates a target for an item and returns the placement it produces, plus the
 * occupant that has to move when the target is taken and a swap was allowed. Reads
 * only, so a dry run and a create validate through the same path.
 */
export function resolveTargetPlacement(
  db: Db,
  item: MovableItem,
  current: repo.PlacementRow | null,
  target: PlacementTarget,
  opts: { swap?: boolean; allowUnverified?: boolean },
): TargetResolution {
  const itemId = item.id;
  const swapAllowed = opts.swap === true;
  let verified = true;
  let occupant: { row: repo.InventoryItemJoined; final: repo.PlacementInput } | null = null;

  if (target.location === 'grid') {
    if (swapAllowed) {
      throw new WriteError(422, 'INVALID_PLACEMENT', 'Grid moves do not swap; the client resolves grid cells');
    }
    const storage = repo.getStorage(db, target.storageId);
    if (!storage || storage.character_id !== item.character_id) {
      throw new WriteError(404, 'STORAGE_NOT_FOUND', 'Storage not found');
    }
    if (storage.kind === 'overflow') {
      throw new WriteError(422, 'INVALID_PLACEMENT', 'The intake stash only releases items');
    }
    const rect = itemRect(target.x, target.y, itemSize(db, item));
    if (!fits({ width: storage.width, height: storage.height }, rect)) {
      throw new WriteError(409, 'OUT_OF_BOUNDS', 'The item does not fit this grid position', {
        width: storage.width,
        height: storage.height,
      });
    }
    const occupied = repo
      .listStoragePlacements(db, storage.id)
      .filter((placement) => placement.item_id !== itemId)
      .map((placement) => {
        const row = repo.getInventoryItem(db, placement.item_id);
        return row ? placementRect(db, row, placement) : null;
      })
      .filter((placed): placed is Rect => placed !== null);
    if (findCollision(rect, occupied)) {
      throw new WriteError(409, 'SLOT_OCCUPIED', 'Another item already occupies these cells');
    }
  } else if (target.location === 'equipment') {
    if (!isEquipmentSlot(target.slot)) {
      throw new WriteError(422, 'INVALID_PLACEMENT', `Unknown equipment slot "${target.slot}"`);
    }
    if (!acceptsEquipment(target.slot, item)) {
      throw new WriteError(422, 'INVALID_PLACEMENT', `A ${item.kind} cannot be equipped in ${target.slot}`);
    }
    const occupantRow = repo
      .listPlacements(db, item.character_id)
      .find(
        (placement) =>
          placement.location === 'equipment' &&
          placement.equipment_slot === target.slot &&
          placement.item_id !== itemId,
      );
    if (occupantRow) {
      if (!swapAllowed) throw new WriteError(409, 'SLOT_OCCUPIED', 'The equipment slot is occupied');
      const row = loadItem(db, occupantRow.item_id);
      occupant = {
        row,
        final: resolveSwapPlacement(db, row, current, [itemId, row.id]),
      };
    }
  } else if (target.location === 'container') {
    const container = repo.getInventoryItem(db, target.containerItemId);
    if (!container || container.character_id !== item.character_id) {
      throw new WriteError(404, 'ITEM_NOT_FOUND', 'Container not found');
    }
    if (container.kind !== 'container') {
      throw new WriteError(422, 'NOT_A_CONTAINER', 'The target item is not a container');
    }
    if (item.kind !== 'artifact') {
      throw new WriteError(422, 'NOT_AN_ARTIFACT', 'Only an artifact can fill a container slot');
    }
    const slots = effectiveContainerSlots(db, container);
    if (slots == null) {
      throw new WriteError(422, 'VALIDATION', 'The container has no artifact slot data');
    }
    if (target.slot >= slots) {
      throw new WriteError(409, 'CONTAINER_FULL', 'The container has no such artifact slot', { slots });
    }
    const occupantRow = repo
      .listPlacements(db, item.character_id)
      .find(
        (placement) =>
          placement.location === 'container' &&
          placement.container_item_id === target.containerItemId &&
          placement.container_slot === target.slot &&
          placement.item_id !== itemId,
      );
    if (occupantRow) {
      if (!swapAllowed) throw new WriteError(409, 'SLOT_OCCUPIED', 'The container slot is occupied');
      if (current?.location !== 'container' || current.container_item_id !== target.containerItemId) {
        throw new WriteError(422, 'INVALID_PLACEMENT', 'Artifacts swap only inside the same container');
      }
      const row = loadItem(db, occupantRow.item_id);
      occupant = {
        row,
        final: {
          itemId: row.id,
          characterId: item.character_id,
          location: 'container',
          containerItemId: target.containerItemId,
          containerSlot: current.container_slot,
        },
      };
    }
  } else if (target.location === 'weapon_modification') {
    const weapon = repo.getInventoryItem(db, target.weaponItemId);
    if (!weapon || weapon.character_id !== item.character_id) {
      throw new WriteError(404, 'ITEM_NOT_FOUND', 'Weapon not found');
    }
    verified = validateModificationInstall(db, item, weapon, target.slot, opts.allowUnverified === true);
    const occupantRow = repo
      .listPlacements(db, item.character_id)
      .find(
        (placement) =>
          placement.location === 'weapon_modification' &&
          placement.weapon_item_id === target.weaponItemId &&
          placement.modification_slot === target.slot &&
          placement.item_id !== itemId,
      );
    if (occupantRow) {
      if (!swapAllowed) throw new WriteError(409, 'SLOT_OCCUPIED', 'The modification slot is occupied');
      const row = loadItem(db, occupantRow.item_id);
      occupant = { row, final: resolveSwapPlacement(db, row, current, [itemId, row.id]) };
    }
  }

  const next = toPlacement(item, target, verified);
  return { next, occupant, verified };
}

export function moveInventoryItem(
  db: Db,
  itemId: number,
  target: PlacementTarget,
  opts: { swap?: boolean; allowUnverified?: boolean; dryRun: boolean },
): WriteResult {
  const item = loadItem(db, itemId);
  const current = repo.getPlacement(db, itemId);
  const { next, occupant } = resolveTargetPlacement(db, item, current, target, opts);
  const before = inventoryItemSnapshot(db, itemId);
  const after = {
    ...before,
    placement: placementInputSnapshot(next),
    ...(occupant
      ? {
          swapped: {
            itemId: occupant.row.id,
            placement: placementInputSnapshot(occupant.final),
          },
        }
      : {}),
  };
  const unchanged = samePlacement(current, next) && !occupant;
  const human = unchanged
    ? `"${item.display_name ?? item.item_name}" is already there`
    : `Moved "${item.display_name ?? item.item_name}" to ${targetDescription(target)}`;

  if (opts.dryRun || unchanged) return { dryRun: opts.dryRun, diff: { before, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    if (occupant) {
      // Free the occupied slot first; the final placement is written below.
      repo.upsertPlacement(db, {
        itemId: occupant.row.id,
        characterId: occupant.row.character_id,
        location: 'loose',
      });
    }
    repo.upsertPlacement(db, next);
    if (occupant) repo.upsertPlacement(db, occupant.final);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'inventory.item.move',
      entity: 'inventory',
      entityId: itemId,
      before,
      after,
    });
  });
  return { dryRun: false, diff: { before, after, human }, eventId };
}

export function setWeaponModification(
  db: Db,
  weaponItemId: number,
  slot: string,
  modificationItemId: number | null,
  opts: { allowUnverified?: boolean; dryRun: boolean },
): WriteResult {
  const weapon = loadItem(db, weaponItemId);
  if (weapon.kind !== 'weapon') {
    throw new WriteError(422, 'NOT_A_WEAPON', 'Modifications attach to a weapon only');
  }

  const current = repo
    .listPlacements(db, weapon.character_id)
    .find(
      (placement) =>
        placement.location === 'weapon_modification' &&
        placement.weapon_item_id === weaponItemId &&
        placement.modification_slot === slot,
    );
  const before = {
    weaponItemId,
    slot,
    modificationItemId: current?.item_id ?? null,
    modification: current ? inventoryItemSnapshot(db, current.item_id) : null,
    /** Where the incoming modification was before the install, for an exact rollback. */
    incomingPlacement: null as Record<string, unknown> | null,
  };

  if (modificationItemId === null) {
    if (!current) {
      const after = { weaponItemId, slot, modificationItemId: null, modification: null };
      return { dryRun: opts.dryRun, diff: { before, after, human: `No modification in ${slot}` } };
    }
    if (!opts.dryRun) ensureOverflowStorage(db, weapon.character_id);
    const removed = repo.getInventoryItem(db, current.item_id)!;
    const spot = nextOverflowPlacement(db, weapon.character_id, itemSize(db, removed));
    const after = {
      ...before,
      modificationItemId: null,
      modification: {
        ...inventoryItemSnapshot(db, current.item_id),
        placement: {
          location: 'grid',
          storageId: spot.storageId,
          x: spot.x,
          y: spot.y,
        },
      },
    };
    const human = `Removed "${getInventoryItemName(db, current.item_id)}" from ${slot}`;
    if (opts.dryRun) return { dryRun: true, diff: { before, after, human } };
    let eventId: number | undefined;
    withTransaction(db, () => {
      repo.upsertPlacement(db, {
        itemId: current.item_id,
        characterId: weapon.character_id,
        location: 'grid',
        storageId: spot.storageId,
        x: spot.x,
        y: spot.y,
      });
      eventId = logEvent(db, {
        actor: 'owner',
        action: 'inventory.item.modification',
        entity: 'inventory',
        entityId: weaponItemId,
        before,
        after,
      });
    });
    return { dryRun: false, diff: { before, after, human }, eventId };
  }

  const modification = loadItem(db, modificationItemId);
  if (modification.character_id !== weapon.character_id) {
    throw new WriteError(404, 'ITEM_NOT_FOUND', 'Modification not found');
  }
  if (current?.item_id === modificationItemId) {
    const after = { ...before };
    return { dryRun: opts.dryRun, diff: { before, after, human: 'No changes' } };
  }
  const verified = validateModificationInstall(db, modification, weapon, slot, opts.allowUnverified === true);
  const priorPlacement = repo.getPlacement(db, modificationItemId);
  before.incomingPlacement = priorPlacement ? placementSnapshot(priorPlacement) : null;
  const after = {
    weaponItemId,
    slot,
    modificationItemId,
    verified,
    modification: {
      ...inventoryItemSnapshot(db, modificationItemId),
      placement: {
        location: 'weapon_modification',
        weaponItemId,
        modificationSlot: slot,
        verified,
      },
    },
  };
  const human = `Installed "${modification.display_name ?? modification.item_name}" into ${slot}`;
  if (opts.dryRun) return { dryRun: true, diff: { before, after, human } };

  if (current && !opts.dryRun) ensureOverflowStorage(db, weapon.character_id);
  const displaced = current
    ? {
        itemId: current.item_id,
        spot: nextOverflowPlacement(db, weapon.character_id, itemSize(db, repo.getInventoryItem(db, current.item_id)!)),
      }
    : null;

  let eventId: number | undefined;
  withTransaction(db, () => {
    if (displaced) {
      repo.upsertPlacement(db, {
        itemId: displaced.itemId,
        characterId: weapon.character_id,
        location: 'grid',
        storageId: displaced.spot.storageId,
        x: displaced.spot.x,
        y: displaced.spot.y,
      });
    }
    repo.upsertPlacement(db, {
      itemId: modificationItemId,
      characterId: weapon.character_id,
      location: 'weapon_modification',
      weaponItemId,
      modificationSlot: slot,
      verified,
    });
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'inventory.item.modification',
      entity: 'inventory',
      entityId: weaponItemId,
      before,
      after,
    });
  });
  return { dryRun: false, diff: { before, after, human }, eventId };
}

function getInventoryItemName(db: Db, itemId: number): string {
  const row = repo.getInventoryItem(db, itemId);
  return row?.display_name ?? row?.item_name ?? `item #${itemId}`;
}
