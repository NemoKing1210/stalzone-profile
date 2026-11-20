import type { InventoryItemRead, InventoryRead, PlacementRead, StorageKind } from '@profile/shared/contracts';

/** Where an instance sits, plus the names the tables show for that place. */
export interface InstanceLocationRow {
  location: PlacementRead['location'] | null;
  storageId: number | null;
  storageName: string | null;
  storageKind: StorageKind | null;
  parentName: string | null;
  equipmentSlot: string | null;
  moduleSlot: string | null;
  slotIndex: number | null;
}

/** Row fields shared by every instance table. */
export interface InstanceRow {
  instanceId: number | null;
  /** The payload object the row was built from; `null` for catalog rows. */
  item: InventoryItemRead | null;
  placement: PlacementRead | null;
}

export interface InventoryIndex {
  items: InventoryItemRead[];
  storages: Map<number, { kind: StorageKind; name: string }>;
  containers: Map<number, InventoryItemRead>;
  weapons: Map<number, InventoryItemRead>;
}

/**
 * Every instance in the profile: equipped items, loose items, grid items, and the
 * artifacts and modules nested inside them. One id appears once.
 */
export function allInventoryItems(inventory: InventoryRead | null | undefined): InventoryItemRead[] {
  if (!inventory) return [];
  const seen = new Map<number, InventoryItemRead>();
  const visit = (item: InventoryItemRead): void => {
    if (seen.has(item.id)) return;
    seen.set(item.id, item);
    for (const child of [...(item.artifacts ?? []), ...(item.modules ?? [])]) visit(child);
  };

  for (const item of Object.values(inventory.equipment ?? {})) if (item) visit(item);
  for (const item of inventory.loose ?? []) visit(item);
  for (const storage of inventory.storages ?? []) for (const item of storage.items ?? []) visit(item);
  return [...seen.values()];
}

/** Build the lookup maps once per payload; location labels then cost a map read. */
export function buildInventoryIndex(inventory: InventoryRead | null | undefined): InventoryIndex {
  const items = allInventoryItems(inventory);
  const storages = new Map(
    (inventory?.storages ?? []).map((storage) => [storage.id, { kind: storage.kind, name: storage.name }]),
  );
  const containers = new Map<number, InventoryItemRead>();
  const weapons = new Map<number, InventoryItemRead>();
  for (const item of items) {
    if (item.kind === 'container') containers.set(item.id, item);
    if (item.kind === 'weapon') weapons.set(item.id, item);
  }
  return { items, storages, containers, weapons };
}

/** Resolve the location of one instance against the index. */
export function locationOf(item: InventoryItemRead, index: InventoryIndex): InstanceLocationRow {
  const placement = item.placement;
  if (placement.location === 'grid') {
    const storage = index.storages.get(placement.storageId);
    return {
      location: 'grid',
      storageId: placement.storageId,
      storageName: storage?.name ?? null,
      storageKind: storage?.kind ?? null,
      parentName: null,
      equipmentSlot: null,
      moduleSlot: null,
      slotIndex: null,
    };
  }
  if (placement.location === 'equipment') {
    return {
      location: 'equipment',
      storageId: null,
      storageName: null,
      storageKind: null,
      parentName: null,
      equipmentSlot: placement.slot,
      moduleSlot: null,
      slotIndex: null,
    };
  }
  if (placement.location === 'container') {
    return {
      location: 'container',
      storageId: null,
      storageName: null,
      storageKind: null,
      parentName: index.containers.get(placement.containerItemId)?.name ?? null,
      equipmentSlot: null,
      moduleSlot: null,
      slotIndex: placement.slotIndex,
    };
  }
  if (placement.location === 'weapon_module') {
    return {
      location: 'weapon_module',
      storageId: null,
      storageName: null,
      storageKind: null,
      parentName: index.weapons.get(placement.weaponItemId)?.name ?? null,
      equipmentSlot: null,
      moduleSlot: placement.slot,
      slotIndex: null,
    };
  }
  return {
    location: 'loose',
    storageId: null,
    storageName: null,
    storageKind: null,
    parentName: null,
    equipmentSlot: null,
    moduleSlot: null,
    slotIndex: null,
  };
}

/** Card field readers: a missing or wrong-typed field stays `null`, never zero. */
export function cardValue(card: Record<string, unknown> | null, key: string): number | null {
  const value = card?.[key];
  return typeof value === 'number' ? value : null;
}

export function cardText(card: Record<string, unknown> | null, key: string): string | null {
  const value = card?.[key];
  return typeof value === 'string' && value ? value : null;
}
