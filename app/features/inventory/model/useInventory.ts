import type {
  InventoryItemRead,
  InventoryRead,
  LoadoutStats,
  PlacementTarget,
  StorageRead,
} from '@profile/shared/contracts';

import { useProfileData } from '~/stores/profile-data';

import { applyPending, clearPending, type PendingMove } from './pending';
import { useFilters } from './useFilters';

/**
 * The instance inventory as the grid screens consume it: one typed read of
 * `payload.inventory`, the stash selection, and write wrappers over `useWrite`.
 * Every mutation goes through the REST service, never through the payload cache.
 */
export function useInventory() {
  const { payload, refresh } = useProfileData();
  const { write, busy: writing, lastError } = useWrite();

  /** Moves shown at their destination while the server answers; cleared by the refresh. */
  const pending = ref(new Map<number, PendingMove>());
  /** Writes queued or reconciling; keeps `busy` true through the refresh. */
  const moving = ref(0);
  const busy = computed(() => writing.value || moving.value > 0);
  /** Monotonic clock: a refresh only clears moves that settled before it was requested. */
  let clock = 0;
  /** Moves reach the server one at a time, so an older request cannot land last. */
  let queue: Promise<unknown> = Promise.resolve();

  const inventory = computed<InventoryRead | null>(() => {
    const base = payload.value?.inventory ?? null;
    if (!base) return null;
    return pending.value.size ? applyPending(base, [...pending.value.values()]) : base;
  });
  const storages = computed<StorageRead[]>(() => inventory.value?.storages ?? []);
  const inventoryStorage = computed<StorageRead | null>(
    () => storages.value.find((storage) => storage.kind === 'inventory') ?? null,
  );
  const stashes = computed<StorageRead[]>(() => storages.value.filter((storage) => storage.kind === 'stash'));
  const overflow = computed<StorageRead | null>(
    () => storages.value.find((storage) => storage.kind === 'overflow') ?? null,
  );
  const equipment = computed(() => inventory.value?.equipment ?? null);
  const loose = computed<InventoryItemRead[]>(() => inventory.value?.loose ?? []);
  const stats = computed<LoadoutStats | null>(() => inventory.value?.stats ?? null);

  const selection = useFilters('inventory-grid', { storageId: 0 });

  const selectedStorage = computed<StorageRead | null>(() => {
    const available = [...(overflow.value ? [overflow.value] : []), ...stashes.value];
    const chosen = available.find((storage) => storage.id === Number(selection.storageId));
    return chosen ?? stashes.value[0] ?? overflow.value;
  });

  function selectStorage(id: number | null): void {
    selection.storageId = id ?? 0;
  }

  async function performMove(
    entry: PendingMove,
    options: { swap?: boolean; allowUnverified?: boolean },
  ) {
    const { itemId, target } = entry;
    const result = await write(`/api/v1/inventory/items/${itemId}/move`, {
      method: 'POST',
      // Dropping onto an occupied equipment, container or module slot means swapping;
      // the server decides whether the displaced item has a safe place to go.
      body: { target, swap: options.swap ?? target.location !== 'grid', ...options },
      silent: true,
      reconcile: 'none',
    });
    if (!result) {
      // A rejected move reverts at once; awaiting the refresh first would keep drawing
      // the item at a place the server never stored for the whole round trip.
      if (pending.value.get(itemId) === entry) pending.value.delete(itemId);
      await refresh();
      return null;
    }
    entry.settledAt = ++clock;
    const refreshAt = ++clock;
    try {
      // The screen already shows the item at its target; this replaces the optimism
      // with the server's payload.
      await refresh();
    } finally {
      const kept = clearPending([...pending.value.values()], refreshAt, payload.value?.inventory ?? null);
      pending.value = new Map(kept.map((keptEntry) => [keptEntry.itemId, keptEntry]));
    }
    return result;
  }

  function move(
    itemId: number,
    target: PlacementTarget,
    options: { swap?: boolean; allowUnverified?: boolean } = {},
  ) {
    // The screen shows the landing immediately; the request waits for its turn.
    const entry: PendingMove = { itemId, target };
    pending.value.set(itemId, entry);
    moving.value += 1;
    const run = queue.then(() => performMove(entry, options));
    queue = run.catch(() => undefined);
    return run.finally(() => {
      moving.value -= 1;
    });
  }

  function createStorage(input: { name: string; kind?: 'inventory' | 'stash' }) {
    return write('/api/v1/inventory/storages', { method: 'POST', body: input });
  }

  function updateStorage(id: number, patch: { name?: string; maxWeight?: number | null }) {
    return write(`/api/v1/inventory/storages/${id}`, { method: 'PATCH', body: patch });
  }

  function deleteStorage(id: number) {
    return write(`/api/v1/inventory/storages/${id}`, { method: 'DELETE', body: {} });
  }

  function tidy(storageId: number, order: string, dryRun = false) {
    return write(`/api/v1/inventory/storages/${storageId}/tidy`, {
      method: 'POST',
      body: { order, dryRun },
      silent: true,
    });
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
    overflow,
    equipment,
    loose,
    stats,
    selectedStorage,
    selectStorage,
    move,
    createStorage,
    updateStorage,
    deleteStorage,
    tidy,
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
