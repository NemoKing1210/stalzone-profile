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
