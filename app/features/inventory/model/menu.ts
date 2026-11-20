import type {
  EquipmentRead,
  EquipmentSlot,
  InventoryItemRead,
  PlacementTarget,
  StorageRead,
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

const QUICK_SLOTS: readonly EquipmentSlot[] = ['quick1', 'quick2', 'quick3', 'quick4'];

function category(value: string | null): string {
  return (value ?? '').toLowerCase();
}

function isBackpack(value: string | null): boolean {
  const categoryValue = category(value);
  return categoryValue === 'backpacks' || categoryValue.startsWith('backpacks/') || categoryValue.includes('backpack');
}

function isArtifactContainer(value: string | null): boolean {
  const categoryValue = category(value);
  return categoryValue === 'containers' || (categoryValue.startsWith('containers/') && !isBackpack(value));
}

/**
 * Equipment slots the server accepts this instance in, most specific first. Mirrors
 * `acceptsEquipment` in core so the menu never offers a slot the write would reject.
 */
export function equipSlots(item: InventoryItemRead): EquipmentSlot[] {
  if (item.kind === 'weapon') {
    return category(item.category) === 'weapon/melee'
      ? ['melee', 'primary', 'secondary']
      : ['primary', 'secondary'];
  }
  if (item.kind === 'armor') return ['armor'];
  if (item.kind === 'container') {
    if (isBackpack(item.category)) return ['backpack'];
    if (isArtifactContainer(item.category)) return ['container'];
    return [];
  }
  if (item.kind === 'ammo' || item.kind === 'other') return [...QUICK_SLOTS];
  return [];
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
  const [first, ...rest] = equipSlots(item);
  if (!first) return null;
  const free = [first, ...rest].find((slot) => equipment?.[slot] == null);
  return { slot: free ?? first };
}
