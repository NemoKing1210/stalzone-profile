import type { InventoryRead } from '@profile/shared/contracts';
import type { ProfilePayload } from '~/shared/types/profile';

export interface NavCounts {
  weapons: number | null;
  armor: number | null;
  containers: number | null;
  artifacts: number | null;
  inventory: number | null;
  devices: number | null;
}

/**
 * Owned instances across every place the payload keeps one: storage grids, the
 * equipped slots and the loose tray. A set keeps an instance counted once even
 * if two lists overlap; a stack is one row and therefore one item.
 */
export function inventoryCount(inventory: InventoryRead | null | undefined): number | null {
  if (!inventory) return null;
  const ids = new Set<number>();
  for (const storage of inventory.storages ?? []) {
    for (const item of storage.items ?? []) ids.add(item.id);
  }
  for (const item of Object.values(inventory.equipment ?? {})) {
    if (item) ids.add(item.id);
  }
  for (const item of inventory.loose ?? []) ids.add(item.id);
  return ids.size;
}

/**
 * Owned counts for the menu badges, from the same payload lists the pages render.
 * `null` means the payload is not available yet, so the badge shows nothing rather
 * than a misleading zero.
 */
export function navCounts(payload: ProfilePayload | null | undefined): NavCounts {
  if (!payload) {
    return { weapons: null, armor: null, containers: null, artifacts: null, inventory: null, devices: null };
  }
  return {
    weapons: payload.weapons.length,
    armor: payload.armor.length,
    containers: payload.containers.length,
    artifacts: payload.artifacts.length,
    inventory: inventoryCount(payload.inventory),
    devices: payload.catalog?.devices?.length ?? 0,
  };
}
