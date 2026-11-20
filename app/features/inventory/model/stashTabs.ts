import type { StorageRead } from '@profile/shared/contracts';

export interface StashTab {
  storage: StorageRead;
  active: boolean;
}

/**
 * The stash strip: intake first when present, then regular stashes in payload order.
 * An unknown selected id falls back to the first regular stash, then intake, so the
 * active tab is always visible.
 */
export function stashTabs(
  stashes: readonly StorageRead[],
  overflow: StorageRead | null,
  selectedId: number | null,
): StashTab[] {
  const available = [...(overflow ? [overflow] : []), ...stashes];
  if (!available.length) return [];
  const active =
    available.find((storage) => storage.id === selectedId) ?? stashes[0] ?? overflow ?? available[0]!;
  return available.map((storage) => ({ storage, active: storage.id === active.id }));
}
