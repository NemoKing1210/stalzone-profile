import { defineStore } from 'pinia';

import type { ItemModalTarget } from '~/shared/lib/itemModal';

/**
 * The one open item card: any surface (chat card, table row, inventory tile, deep link)
 * names a target and the host in the layout resolves and renders it. Intent only.
 */
export const useItemModalStore = defineStore('item-modal', () => {
  const target = ref<ItemModalTarget | null>(null);

  function openTarget(next: ItemModalTarget | null): void {
    target.value = next;
  }

  function openInstance(instanceId: number, kind: string): void {
    openTarget({ mode: 'instance', instanceId, kind });
  }

  function openCatalog(next: Extract<ItemModalTarget, { mode: 'catalog' }>): void {
    openTarget(next);
  }

  function close(): void {
    target.value = null;
  }

  return { target, openTarget, openInstance, openCatalog, close };
});
