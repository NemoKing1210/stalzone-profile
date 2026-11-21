/** A card link from the assistant: one owned instance, or a catalog row by name. */
export interface InventoryDeepLink {
  itemId: number | null;
  name: string | null;
  mode: 'catalog' | null;
}

/**
 * Reads `?item=<instanceId>` and `?mode=catalog&name=<item name>`. Anything else (an empty
 * link, a non-numeric id, a catalog name missing) is not a deep link and leaves the page alone.
 */
export function parseInventoryDeepLink(query: Record<string, unknown>): InventoryDeepLink | null {
  const itemId = typeof query.item === 'string' && /^\d+$/.test(query.item) ? Number(query.item) : null;
  const name = typeof query.name === 'string' && query.name.trim() !== '' ? query.name : null;
  const mode = query.mode === 'catalog' && name ? 'catalog' : null;
  if (itemId == null && !(mode && name)) return null;
  return { itemId, name, mode };
}

/** The first row the link names; an owned id wins over a catalog name. */
export function findRowForDeepLink<T extends { name: string; instanceId?: number | null }>(
  rows: readonly T[],
  link: InventoryDeepLink,
): T | null {
  if (link.itemId != null) return rows.find((row) => row.instanceId === link.itemId) ?? null;
  if (link.name) return rows.find((row) => row.name === link.name) ?? null;
  return null;
}

/** Drops the deep-link keys so closing the modal does not reopen it; `add=1` and others survive. */
export function withoutInventoryDeepLink(query: Record<string, unknown>): Record<string, unknown> {
  const { item: _item, mode: _mode, name: _name, ...rest } = query;
  return rest;
}
