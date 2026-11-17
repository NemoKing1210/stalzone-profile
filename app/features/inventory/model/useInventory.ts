import type {
  InventoryItemRead,
  InventoryRead,
  LoadoutStats,
  PlacementTarget,
  StorageRead,
} from '@profile/shared/contracts';

import { useFilters } from './useFilters';

/**
 * The instance inventory as the grid screens consume it: one typed read of
 * `payload.inventory`, the stash selection, and write wrappers over `useWrite`.
 * Every mutation goes through the REST service, never through the payload cache.
 */
export function useInventory() {
  const { payload } = useProfile();
  const { write, busy, lastError } = useWrite();

  const inventory = computed<InventoryRead | null>(() => payload.value?.inventory ?? null);
  const storages = computed<StorageRead[]>(() => inventory.value?.storages ?? []);
  const inventoryStorage = computed<StorageRead | null>(
    () => storages.value.find((storage) => storage.kind === 'inventory') ?? null,
  );
  const stashes = computed<StorageRead[]>(() => storages.value.filter((storage) => storage.kind === 'stash'));
  const equipment = computed(() => inventory.value?.equipment ?? null);
  const loose = computed<InventoryItemRead[]>(() => inventory.value?.loose ?? []);
  const stats = computed<LoadoutStats | null>(() => inventory.value?.stats ?? null);

  const selection = useFilters('inventory-grid', { storageId: 0 });

  const selectedStorage = computed<StorageRead | null>(() => {
    const chosen = stashes.value.find((storage) => storage.id === Number(selection.storageId));
    return chosen ?? stashes.value[0] ?? null;
  });

  function selectStorage(id: number | null): void {
    selection.storageId = id ?? 0;
  }

  function move(
    itemId: number,
    target: PlacementTarget,
    options: { swap?: boolean; allowUnverified?: boolean } = {},
  ) {
    return write(`/api/v1/inventory/items/${itemId}/move`, {
      method: 'POST',
      body: { target, ...options },
    });
  }

  function createStorage(input: { name: string; width: number; height: number; kind?: 'inventory' | 'stash' }) {
    return write('/api/v1/inventory/storages', { method: 'POST', body: input });
  }

  function updateStorage(
    id: number,
    patch: { name?: string; width?: number; height?: number; maxWeight?: number | null },
  ) {
    return write(`/api/v1/inventory/storages/${id}`, { method: 'PATCH', body: patch });
  }

  function deleteStorage(id: number, moveToStorageId?: number | null) {
    return write(`/api/v1/inventory/storages/${id}`, {
      method: 'DELETE',
      body: moveToStorageId == null ? {} : { moveToStorageId },
    });
  }

  function autoArrange(storageId: number) {
    return write(`/api/v1/inventory/storages/${storageId}/auto-arrange`, { method: 'POST', body: {} });
  }

  function setContainerFill(containerId: number, slots: (number | null)[]) {
    return write(`/api/v1/inventory/containers/${containerId}/fill`, { method: 'PUT', body: { slots } });
  }

  function setWeaponModule(
    weaponId: number,
    slot: string,
    attachmentItemId: number | null,
    allowUnverified = false,
  ) {
    return write(`/api/v1/inventory/weapons/${weaponId}/modules/${slot}`, {
      method: 'PUT',
      body: { attachmentItemId, allowUnverified },
    });
  }

  function addItem(input: Record<string, unknown>) {
    return write('/api/v1/inventory/items', { method: 'POST', body: input });
  }

  function updateItem(id: number, patch: Record<string, unknown>) {
    return write(`/api/v1/inventory/items/${id}`, { method: 'PATCH', body: patch });
  }

  function removeItem(id: number, qty?: number) {
    return write(`/api/v1/inventory/items/${id}`, {
      method: 'DELETE',
      body: qty == null ? {} : { qty },
    });
  }

  return {
    inventory,
    storages,
    inventoryStorage,
    stashes,
    equipment,
    loose,
    stats,
    selectedStorage,
    selectStorage,
    move,
    createStorage,
    updateStorage,
    deleteStorage,
    autoArrange,
    setContainerFill,
    setWeaponModule,
    addItem,
    updateItem,
    removeItem,
    busy,
    lastError,
  };
}

export type InventoryApi = ReturnType<typeof useInventory>;
