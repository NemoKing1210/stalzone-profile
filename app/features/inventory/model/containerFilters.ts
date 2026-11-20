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
 * While a container is filtered, a same-container drop would place an item among
 * hidden cells the owner cannot see. It is refused locally; moving into any other
 * container or stash stays possible.
 */
export function filteredDropBlocked(
  item: Pick<InventoryItemRead, 'placement'>,
  target: { location: string; storageId?: number },
  activeStorages: ReadonlySet<number>,
): boolean {
  return (
    item.placement.location === 'grid' &&
    target.location === 'grid' &&
    target.storageId != null &&
    item.placement.storageId === target.storageId &&
    activeStorages.has(target.storageId)
  );
}
