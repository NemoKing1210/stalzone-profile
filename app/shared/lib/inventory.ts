import type { InventoryItemRead, InventoryRead } from '@profile/shared/contracts';

/**
 * Every instance in the profile: equipped items, loose items, grid items, and the
 * artifacts and modifications nested inside them. One id appears once.
 *
 * This lives in `shared` because both the inventory screens and the assistant's item
 * picker need the same flattening; a feature may not import another feature.
 */
export function allInventoryItems(inventory: InventoryRead | null | undefined): InventoryItemRead[] {
  if (!inventory) return [];
  const seen = new Map<number, InventoryItemRead>();
  const visit = (item: InventoryItemRead): void => {
    if (seen.has(item.id)) return;
    seen.set(item.id, item);
    for (const child of [...(item.artifacts ?? []), ...(item.modifications ?? [])]) visit(child);
  };

  for (const item of Object.values(inventory.equipment ?? {})) if (item) visit(item);
  for (const item of inventory.loose ?? []) visit(item);
  for (const storage of inventory.storages ?? []) for (const item of storage.items ?? []) visit(item);
  return [...seen.values()];
}
