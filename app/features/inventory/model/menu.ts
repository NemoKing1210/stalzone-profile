import {
  equipmentSlotsFor,
  type EquipmentRead,
  type EquipmentSlot,
  type InventoryItemRead,
  type PlacementTarget,
  type StorageRead,
} from '@profile/shared/contracts';

import { firstFreeSpot, type GridPlacement } from './grid';

/** A storage the context menu can move an item into, with the cell the move would take. */
export interface MenuDestination {
  storage: StorageRead;
  spot: GridPlacement | null;
}

/** What the tile context menu asks the screen to do; the screen owns the writes. */
export type ItemMenuAction =
  | { kind: 'details' }
  | { kind: 'container' }
  | { kind: 'weapon' }
  | { kind: 'move'; target: PlacementTarget }
  | { kind: 'remove' };

/** Placed items of a storage, the shape `firstFreeSpot` needs. */
function placedItems(storage: StorageRead): { id: number; size: InventoryItemRead['size']; placement: GridPlacement }[] {
  return storage.items.flatMap((item) =>
    item.placement.location === 'grid'
      ? [{ id: item.id, size: item.size, placement: item.placement }]
      : [],
  );
}

/**
 * Where the menu can send an item: every writable storage except the one the item
 * already occupies. The intake is release-only, so it never appears; a full storage
 * stays in the list with `spot: null` so the menu can say why it is unavailable.
 */
export function moveDestinations(
  item: InventoryItemRead,
  storages: readonly StorageRead[],
): MenuDestination[] {
  const current = item.placement.location === 'grid' ? item.placement.storageId : null;
  return storages
    .filter((storage) => storage.kind !== 'overflow' && storage.id !== current)
    .map((storage) => ({
      storage,
      spot: firstFreeSpot({ width: storage.width, height: storage.height }, item, placedItems(storage)),
    }));
}

/**
 * Where "Equip" sends the item: the first empty compatible slot, otherwise the first
 * compatible one, where the server swaps the occupant back to its old place. `null`
 * when the item is already worn or no slot accepts it.
 */
export function equipTarget(
  item: InventoryItemRead,
  equipment: EquipmentRead | null,
): { slot: EquipmentSlot } | null {
  if (item.placement.location === 'equipment') return null;
  const [first, ...rest] = equipmentSlotsFor(item);
  if (!first) return null;
  const free = [first, ...rest].find((slot) => equipment?.[slot] == null);
  return { slot: free ?? first };
}

/** Why a Shift-click produced no write; the screen turns any value into one warning toast. */
export type QuickMoveBlocked = 'no-home' | 'full' | 'incompatible' | 'intake' | 'no-target';

/** What the open left pane offers as the quick-move destination. */
export interface QuickMoveContext {
  pane: 'equipment' | 'stash';
  home: StorageRead | null;
  /** The selected stash or intake, when the stash pane is open. */
  stash: StorageRead | null;
  equipment: EquipmentRead | null;
}

export interface QuickMoveResult {
  target: PlacementTarget | null;
  blocked: QuickMoveBlocked | null;
}

function gridTarget(storage: StorageRead, item: InventoryItemRead): PlacementTarget | null {
  const spot = firstFreeSpot(
    { width: storage.width, height: storage.height },
    item,
    placedItems(storage),
  );
  return spot ? { location: 'grid', storageId: storage.id, x: spot.x, y: spot.y } : null;
}

/**
 * One Shift-click move without opening the card: the open pane names the destination.
 * With equipment open a carried tile equips (the server swaps an occupied slot) and a worn
 * item returns to the first free carried cell; with a stash open a stash tile comes home
 * and a carried tile goes to the selected storage. The intake only ever releases.
 */
export function quickMove(item: InventoryItemRead, context: QuickMoveContext): QuickMoveResult {
  const { home, stash, equipment, pane } = context;
  const placement = item.placement;

  if (placement.location === 'equipment') {
    if (!home) return { target: null, blocked: 'no-home' };
    const target = gridTarget(home, item);
    return target ? { target, blocked: null } : { target: null, blocked: 'full' };
  }

  if (placement.location !== 'grid') return { target: null, blocked: 'no-target' };

  const inHome = home != null && placement.storageId === home.id;
  const inStash = stash != null && placement.storageId === stash.id;

  if (inHome) {
    if (pane === 'equipment') {
      const worn = equipTarget(item, equipment);
      return worn ? { target: { location: 'equipment', slot: worn.slot }, blocked: null } : { target: null, blocked: 'incompatible' };
    }
    if (!stash) return { target: null, blocked: 'no-target' };
    if (stash.kind === 'overflow') return { target: null, blocked: 'intake' };
    const target = gridTarget(stash, item);
    return target ? { target, blocked: null } : { target: null, blocked: 'full' };
  }

  // A tile of the intake or of the selected stash comes back to the carried grid.
  if (inStash) {
    if (!home) return { target: null, blocked: 'no-home' };
    const target = gridTarget(home, item);
    return target ? { target, blocked: null } : { target: null, blocked: 'full' };
  }

  return { target: null, blocked: 'no-target' };
}
