import type { InventoryItemRead, InventoryRead } from '@profile/shared/contracts';

import { allInventoryItems } from './inventory';

/**
 * What a surface asks the global item modal to show: one owned instance, or a catalog row.
 * The host resolves the data; callers never carry a payload copy.
 */
export type ItemModalTarget =
  | { mode: 'instance'; instanceId: number; kind: string }
  | {
      mode: 'catalog';
      kind: string;
      name: string;
      icon: string | null;
      rank: string | null;
      category: string | null;
    };

/** The `/api/v1/details` key prefix for every kind the modal can open. */
const CARD_PREFIX: Record<string, string> = {
  weapon: 'w',
  armor: 'a',
  artifact: 'art',
  container: 'c',
  modification: 'mod',
};

/** The kind page that still owns the deep link a chip copies or opens in a new tab. */
const KIND_PATHS: Record<string, string> = {
  weapon: '/weapons',
  armor: '/armor',
  container: '/containers',
  artifact: '/artifacts',
  modification: '/modifications',
};

/** Kinds whose page shows a catalog row without a detail card (gadgets have no card yet). */
const ROW_ONLY_KINDS: Record<string, true> = { device: true };

/** The detail-card key the catalog endpoint expects; unsupported or unnamed kinds have none. */
export function catalogKey(kind: string | null, name: string): string | null {
  const prefix = kind ? CARD_PREFIX[kind] : undefined;
  return prefix && name.trim() !== '' ? `${prefix}:${name}` : null;
}

/** A row-only kind opens from the row alone; every other kind needs its fetched card. */
export function rowOnlyKind(kind: string | null): boolean {
  return kind != null && ROW_ONLY_KINDS[kind] === true;
}

/** The `/weapons?item=` style link a chip keeps for copy and new-tab; unknown kinds have none. */
export function itemPageHref(kind: string | null, instanceId: number | null, name: string): string | null {
  const path = kind ? KIND_PATHS[kind] : undefined;
  if (!path) return null;
  if (instanceId != null) return `${path}?item=${instanceId}`;
  return `${path}?mode=catalog&name=${encodeURIComponent(name)}`;
}

/** One instance anywhere in the profile, including artifacts and modifications nested in items. */
export function findInstance(
  inventory: InventoryRead | null | undefined,
  instanceId: number,
): InventoryItemRead | null {
  return allInventoryItems(inventory).find((item) => item.id === instanceId) ?? null;
}

/** The row shape `ItemDetailsModal` reads for a catalog card: no instance, no actions. */
export function catalogRow(target: Extract<ItemModalTarget, { mode: 'catalog' }>): Record<string, unknown> {
  return {
    name: target.name,
    kind: target.kind,
    type: target.category,
    icon: target.icon,
    rank: target.rank,
    instanceId: null,
  };
}
