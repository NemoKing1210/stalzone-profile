import type { InventoryItemRead } from '@profile/shared/contracts';

export interface TileMeta {
  name: string;
  /** Weapon class or armor class; null for kinds whose card carries neither. */
  type: string | null;
  caliber: string | null;
  artifacts: number;
  modifications: number;
  /** Artifacts and modifications share one footer slot, so the count is their sum. */
  attached: number;
}

/**
 * The inventory tile's text is the same on the stash grid, the equipment rack and the drag
 * preview. Weapons carry their class in `type`, armor in `cls`; other kinds stay plain.
 */
export function tileMeta(item: InventoryItemRead): TileMeta {
  const card = item.card ?? null;
  const raw = item.kind === 'weapon' ? card?.type : item.kind === 'armor' ? card?.cls : null;
  const type = typeof raw === 'string' && raw.trim() ? raw : null;
  const rawCaliber = item.kind === 'weapon' ? card?.caliber : null;
  const caliber = typeof rawCaliber === 'string' && rawCaliber.trim() ? rawCaliber : null;
  const artifacts = item.artifacts?.length ?? 0;
  const modifications = item.modifications?.length ?? 0;
  return {
    name: item.displayName ?? item.name,
    type,
    caliber,
    artifacts,
    modifications,
    attached: artifacts + modifications,
  };
}
