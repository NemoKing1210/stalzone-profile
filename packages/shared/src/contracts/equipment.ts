import type { EquipmentSlot } from './primitives.js';

/** The parts of an item the equipment slots look at; an inventory row satisfies it. */
export interface EquipmentCandidate {
  kind: string;
  category: string | null;
}

function categoryOf(value: string | null): string {
  return (value ?? '').toLowerCase();
}

export function isBackpackCategory(category: string | null): boolean {
  const value = categoryOf(category);
  return value === 'backpacks' || value.startsWith('backpacks/') || value.includes('backpack');
}

export function isArtifactContainerCategory(category: string | null): boolean {
  const value = categoryOf(category);
  return value === 'containers' || (value.startsWith('containers/') && !isBackpackCategory(category));
}

function isMeleeWeapon(category: string | null): boolean {
  return categoryOf(category).includes('melee');
}

/**
 * One category-level table for every equipment slot: ranged weapons go to the two
 * weapon slots, melee weapons to `melee`, armor to `armor`, backpacks and artifact
 * containers to their own slot, and ammo/consumables to the quick slots. The drag
 * targets, the context menu and the write service all ask this function, so they
 * cannot disagree about what fits.
 */
export function acceptsEquipment(slot: EquipmentSlot, item: EquipmentCandidate): boolean {
  if (slot === 'primary' || slot === 'secondary') {
    return item.kind === 'weapon' && !isMeleeWeapon(item.category);
  }
  if (slot === 'melee') return item.kind === 'weapon' && isMeleeWeapon(item.category);
  if (slot === 'armor') return item.kind === 'armor';
  if (slot === 'backpack') return item.kind === 'container' && isBackpackCategory(item.category);
  if (slot === 'container') return item.kind === 'container' && isArtifactContainerCategory(item.category);
  return item.kind === 'ammo' || item.kind === 'other';
}

/** Every slot the item fits, most specific first; the context menu picks the first free one. */
export function equipmentSlotsFor(item: EquipmentCandidate): EquipmentSlot[] {
  if (item.kind === 'weapon') {
    return isMeleeWeapon(item.category) ? ['melee'] : ['primary', 'secondary'];
  }
  if (item.kind === 'armor') return ['armor'];
  if (item.kind === 'container') {
    if (isBackpackCategory(item.category)) return ['backpack'];
    if (isArtifactContainerCategory(item.category)) return ['container'];
    return [];
  }
  if (item.kind === 'ammo' || item.kind === 'other') return ['quick1', 'quick2', 'quick3', 'quick4'];
  return [];
}
