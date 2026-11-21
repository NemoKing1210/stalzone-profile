import type {
  EquipmentSlot,
  InventoryItemRead,
  InventoryRead,
  PlacementRead,
  PlacementTarget,
} from '@profile/shared/contracts';

/** A move the UI has shown but the payload has not confirmed yet. */
export interface PendingMove {
  itemId: number;
  target: PlacementTarget;
  /** Clock reading when the write settled; absent while the request is still in flight. */
  settledAt?: number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function* walk(items: readonly InventoryItemRead[]): Generator<InventoryItemRead> {
  for (const item of items) {
    yield item;
    yield* walk(item.artifacts ?? []);
    yield* walk(item.modifications ?? []);
  }
}

function roots(inventory: InventoryRead): InventoryItemRead[] {
  return [
    ...inventory.storages.flatMap((storage) => storage.items),
    ...Object.values(inventory.equipment).filter((item): item is InventoryItemRead => item !== null),
    ...inventory.loose,
  ];
}

/** The item anywhere in the tree: storages, equipment, the loose tray and nested children. */
export function findInventoryItem(inventory: InventoryRead, id: number): InventoryItemRead | null {
  for (const root of roots(inventory)) for (const item of walk([root])) if (item.id === id) return item;
  return null;
}

function takeChild(parent: InventoryItemRead, id: number): InventoryItemRead | null {
  for (const key of ['artifacts', 'modifications'] as const) {
    const list = parent[key];
    if (!list) continue;
    const found = takeFrom(list, id);
    if (found) return found;
  }
  return null;
}

function takeFrom(items: InventoryItemRead[], id: number): InventoryItemRead | null {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) return items.splice(index, 1)[0] ?? null;
  for (const item of items) {
    const found = takeChild(item, id);
    if (found) return found;
  }
  return null;
}

function take(inventory: InventoryRead, id: number): InventoryItemRead | null {
  for (const storage of inventory.storages) {
    const found = takeFrom(storage.items, id);
    if (found) return found;
  }
  const found = takeFrom(inventory.loose, id);
  if (found) return found;
  for (const slot of Object.keys(inventory.equipment) as EquipmentSlot[]) {
    const item = inventory.equipment[slot];
    if (!item) continue;
    if (item.id === id) {
      inventory.equipment[slot] = null;
      return item;
    }
    const child = takeChild(item, id);
    if (child) return child;
  }
  return null;
}

function placementOf(target: PlacementTarget): PlacementRead {
  if (target.location === 'grid') {
    return { location: 'grid', storageId: target.storageId, x: target.x, y: target.y };
  }
  if (target.location === 'equipment') return { location: 'equipment', slot: target.slot };
  if (target.location === 'container') {
    return { location: 'container', containerItemId: target.containerItemId, slotIndex: target.slot };
  }
  return { location: 'weapon_modification', weaponItemId: target.weaponItemId, slot: target.slot, verified: true };
}

function containerSlot(item: InventoryItemRead): number {
  return item.placement.location === 'container' ? item.placement.slotIndex : 0;
}

function put(inventory: InventoryRead, item: InventoryItemRead, placement: PlacementRead): boolean {
  if (placement.location === 'grid') {
    const storage = inventory.storages.find((entry) => entry.id === placement.storageId);
    if (!storage) return false;
    storage.items.push(item);
    return true;
  }
  if (placement.location === 'equipment') {
    inventory.equipment[placement.slot] = item;
    return true;
  }
  if (placement.location === 'loose') {
    inventory.loose.push(item);
    return true;
  }
  const ownerId = placement.location === 'container' ? placement.containerItemId : placement.weaponItemId;
  const owner = findInventoryItem(inventory, ownerId);
  if (!owner) return false;
  if (placement.location === 'container') {
    const artifacts = (owner.artifacts ??= []);
    artifacts.push(item);
    artifacts.sort((a, b) => containerSlot(a) - containerSlot(b));
  } else {
    (owner.modifications ??= []).push(item);
  }
  return true;
}

/**
 * The inventory with one item already at its target, for the window between the drop and
 * the payload refresh. The occupant of an equipment slot takes the mover's old place,
 * matching the server's swap. Loadout stats and storage weights are left to the refresh:
 * they are the server's numbers, never a client-side estimate.
 */
export function relocateItem(
  inventory: InventoryRead,
  itemId: number,
  target: PlacementTarget,
): InventoryRead {
  const existing = findInventoryItem(inventory, itemId);
  if (!existing) return inventory;
  const oldPlacement = existing.placement;
  const next = clone(inventory);
  const moving = take(next, itemId);
  if (!moving) return inventory;

  let occupant: InventoryItemRead | null = null;
  if (target.location === 'equipment') {
    occupant = next.equipment[target.slot] ?? null;
    if (occupant) next.equipment[target.slot] = null;
  }

  moving.placement = placementOf(target);
  if (!put(next, moving, moving.placement)) return inventory;
  if (occupant) {
    occupant.placement = oldPlacement;
    if (!put(next, occupant, oldPlacement)) return inventory;
  }
  return next;
}

export function applyPending(inventory: InventoryRead, moves: readonly PendingMove[]): InventoryRead {
  return moves.reduce((current, move) => relocateItem(current, move.itemId, move.target), inventory);
}

/** Whether a payload placement is exactly the target a settled move asked for. */
function placementMatchesTarget(placement: PlacementRead, target: PendingMove['target']): boolean {
  if (target.location === 'grid') {
    return (
      placement.location === 'grid' &&
      placement.storageId === target.storageId &&
      placement.x === target.x &&
      placement.y === target.y
    );
  }
  if (target.location === 'equipment') {
    return placement.location === 'equipment' && placement.slot === target.slot;
  }
  if (target.location === 'container') {
    return (
      placement.location === 'container' &&
      placement.containerItemId === target.containerItemId &&
      placement.slotIndex === target.slot
    );
  }
  return (
    placement.location === 'weapon_modification' &&
    placement.weaponItemId === target.weaponItemId &&
    placement.slot === target.slot
  );
}

/**
 * Drops the moves the answered refresh can already see: their write settled before the
 * refresh was requested and the payload actually shows the target. A move still in flight
 * (or settled after the request started) stays optimistic, because that payload cannot
 * contain it; so does a settled move whose payload predates the write — otherwise a stale
 * response would silently snap the item back to its source cell.
 */
export function clearPending(
  moves: readonly PendingMove[],
  refreshAt: number,
  inventory?: InventoryRead | null,
): PendingMove[] {
  return moves.filter((move) => {
    if (move.settledAt == null || move.settledAt > refreshAt) return true;
    if (!inventory) return false;
    const item = findInventoryItem(inventory, move.itemId);
    if (!item) return false;
    return !placementMatchesTarget(item.placement, move.target);
  });
}
