import type { InventoryItemRead } from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';

import {
  containerFilterActive,
  DEFAULT_CONTAINER_FILTER,
  filteredDropBlocked,
  matchesContainerFilter,
  visibleContainerItems,
} from '~/features/inventory/model/containerFilters';

function item(overrides: Partial<InventoryItemRead> = {}): InventoryItemRead {
  return {
    id: 1,
    itemId: 1,
    name: 'Rifle',
    displayName: null,
    kind: 'weapon',
    category: 'weapon/assault_rifle',
    rank: 'RANK_MASTER',
    level: 0,
    quality: 'Редкий 120%',
    rarityPct: 120,
    rarityTier: 'rare',
    qty: 1,
    skinItemId: null,
    icon: null,
    slot: null,
    weight: null,
    size: { width: 5, height: 2 },
    placement: { location: 'grid', storageId: 7, x: 0, y: 0, rotated: false },
    container: null,
    ...overrides,
  };
}

describe('container filter', () => {
  it('is inactive with every axis at its default', () => {
    expect(containerFilterActive(DEFAULT_CONTAINER_FILTER)).toBe(false);
    expect(containerFilterActive({ ...DEFAULT_CONTAINER_FILTER, kind: 'armor' })).toBe(true);
  });

  it('matches kind, rank and rarity tier', () => {
    expect(matchesContainerFilter(item(), DEFAULT_CONTAINER_FILTER)).toBe(true);
    expect(matchesContainerFilter(item(), { ...DEFAULT_CONTAINER_FILTER, kind: 'armor' })).toBe(false);
    expect(matchesContainerFilter(item(), { ...DEFAULT_CONTAINER_FILTER, rank: 'RANK_NEWBIE' })).toBe(false);
    expect(matchesContainerFilter(item(), { ...DEFAULT_CONTAINER_FILTER, quality: 'rare' })).toBe(true);
    expect(matchesContainerFilter(item(), { ...DEFAULT_CONTAINER_FILTER, quality: 'none' })).toBe(false);
  });

  it('keeps the cells of hidden items in the model', () => {
    const items = [item(), item({ id: 2, kind: 'armor', size: { width: 3, height: 3 } })];
    const visible = visibleContainerItems(items, { ...DEFAULT_CONTAINER_FILTER, kind: 'weapon' });
    expect(visible.map((entry) => entry.id)).toEqual([1]);
    expect(items[1]?.placement).toMatchObject({ x: 0, y: 0 });
  });
});

describe('filtered drop guard', () => {
  it('refuses a same-storage grid drop while that storage is filtered', () => {
    expect(filteredDropBlocked(item(), { location: 'grid', storageId: 7 }, new Set([7]))).toBe(true);
  });

  it('allows a drop into another storage or when no filter is active', () => {
    expect(filteredDropBlocked(item(), { location: 'grid', storageId: 8 }, new Set([7]))).toBe(false);
    expect(filteredDropBlocked(item(), { location: 'grid', storageId: 7 }, new Set())).toBe(false);
    expect(filteredDropBlocked(item({ placement: { location: 'loose' } }), { location: 'grid', storageId: 7 }, new Set([7]))).toBe(false);
  });
});
