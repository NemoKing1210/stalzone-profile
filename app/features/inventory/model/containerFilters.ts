import type { InventoryItemRead } from '@profile/shared/contracts';
import { ALL_RANKS } from '~/entities/item/model/rankOptions';

export interface ContainerFilter {
  kind: string;
  rank: string;
  quality: string;
}

export const DEFAULT_CONTAINER_FILTER: ContainerFilter = {
  kind: 'all',
  rank: ALL_RANKS,
  quality: 'all',
};

/** A filter is active only when it can hide at least one item. */
export function containerFilterActive(filter: ContainerFilter): boolean {
  return filter.kind !== 'all' || filter.rank !== ALL_RANKS || filter.quality !== 'all';
}

/** The visible item set for one container; placements and cells are never touched. */
export function matchesContainerFilter(item: InventoryItemRead, filter: ContainerFilter): boolean {
  if (filter.kind !== 'all' && item.kind !== filter.kind) return false;
  if (filter.rank !== ALL_RANKS && item.rank !== filter.rank) return false;
  if (filter.quality !== 'all' && (item.rarityTier ?? item.quality ?? 'none') !== filter.quality) return false;
  return true;
}

export function visibleContainerItems(
  items: readonly InventoryItemRead[],
  filter: ContainerFilter,
): InventoryItemRead[] {
  if (!containerFilterActive(filter)) return [...items];
  return items.filter((item) => matchesContainerFilter(item, filter));
}

/**
 * A filtered grid is packed for the view, so its cells no longer match stored coordinates:
 * any grid drop into one is refused. Dragging out of a filtered grid stays allowed.
 */
export function filteredDropBlocked(
  target: { location: string; storageId?: number },
  activeStorages: ReadonlySet<number>,
): boolean {
  return target.location === 'grid' && target.storageId != null && activeStorages.has(target.storageId);
}
