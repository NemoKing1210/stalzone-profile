import type { ModificationSlot } from './contracts/index.js';

/** The slots a weapon modification can occupy; the order is the panel and table order. */
export const MODIFICATION_SLOTS = ['scope', 'muzzle', 'grip', 'magazine', 'stock', 'tactical', 'other'] as const;

/**
 * The one category→slot mapping. The EXBO category stays source data (`attachment/scope`),
 * while the write service, the catalog builder and the page need the slot it fills.
 */
export function modificationSlotFor(category: string | null | undefined): ModificationSlot {
  const value = (category ?? '').toLowerCase();
  if (value.includes('scope') || value.includes('sight')) return 'scope';
  if (value.includes('muzzle') || value.includes('barrel') || value.includes('silenc')) return 'muzzle';
  if (value.includes('grip') || value.includes('underbarrel')) return 'grip';
  if (value.includes('magazine')) return 'magazine';
  if (value.includes('stock')) return 'stock';
  if (value.includes('tactical') || value.includes('laser') || value.includes('flashlight')) return 'tactical';
  return 'other';
}
