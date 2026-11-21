import type { InventoryItemRead } from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';

import { highlightedSlots } from '~/features/inventory/model/slotHighlights';

function item(overrides: Partial<InventoryItemRead>): InventoryItemRead {
  return {
    id: 1,
    itemId: 1,
    name: 'Item',
    displayName: null,
    kind: 'weapon',
    category: 'weapon/assault_rifle',
    rank: null,
    level: 0,
    quality: null,
    rarityPct: null,
    rarityTier: null,
    virtual: false,
    qty: 1,
    skinItemId: null,
    icon: null,
    slot: null,
    weight: null,
    size: { width: 5, height: 2 },
    placement: { location: 'loose' },
    container: null,
    ...overrides,
  };
}

describe('dragged equipment highlights', () => {
  it('lights only the primary slot for a primary weapon', () => {
    expect(highlightedSlots(item({}))).toEqual(['primary']);
  });

  it('lights only the secondary slot for a pistol', () => {
    expect(highlightedSlots(item({ category: 'weapon/pistol' }))).toEqual(['secondary']);
  });

  it('lights only the melee slot for a melee weapon', () => {
    expect(highlightedSlots(item({ category: 'weapon/melee' }))).toEqual(['melee']);
  });

  it('lights the quick slots for ammo and nothing for a catalog-only kind', () => {
    expect(highlightedSlots(item({ kind: 'ammo', category: 'bullet' }))).toEqual([
      'quick1',
      'quick2',
      'quick3',
      'quick4',
    ]);
    expect(highlightedSlots(item({ kind: 'attachment', category: 'attachment/scope' }))).toEqual([]);
    expect(highlightedSlots(null)).toEqual([]);
  });
});
