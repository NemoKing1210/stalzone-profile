import type { InventoryItemRead, InventoryRead, RangeValue } from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';

import { catalogKey, catalogRow, findInstance, itemPageHref } from '~/shared/lib/itemModal';

const range: RangeValue = { min: 0, max: 0, value: 0, missing: [] };

function item(
  partial: Partial<InventoryItemRead> & Pick<InventoryItemRead, 'id' | 'name' | 'kind'>,
): InventoryItemRead {
  return {
    itemId: partial.id,
    displayName: null,
    category: null,
    rank: null,
    level: 1,
    quality: null,
    rarityPct: null,
    rarityTier: null,
    virtual: false,
    qty: 1,
    skinItemId: null,
    icon: null,
    slot: null,
    weight: null,
    size: { width: 1, height: 1 },
    placement: { location: 'loose' },
    container: null,
    ...partial,
  };
}

function inventory(items: InventoryItemRead[]): InventoryRead {
  return {
    storages: [
      { id: 1, kind: 'inventory', name: 'Inventory', width: 8, height: 10, maxWeight: null, sortOrder: 0, items, weight: range, updatedAt: null },
    ],
    equipment: {
      primary: null,
      secondary: null,
      melee: null,
      armor: null,
      backpack: null,
      container: null,
      quick1: null,
      quick2: null,
      quick3: null,
      quick4: null,
    },
    loose: [],
    stats: {
      carry: { base: 50, bonus: range, total: range, safeLimit: range, carried: range, aboveSafe: null, overweight: null },
      storages: {},
      protection: {},
      effects: {},
      containers: [],
      warnings: [],
    },
    updatedAt: null,
  };
}

const modification = item({ id: 12, name: 'АКМЛ', kind: 'modification' });
const artifact = item({ id: 13, name: 'Ломоть', kind: 'artifact' });
const weapon = item({ id: 11, name: 'АК-12', kind: 'weapon', modifications: [modification] });
const container = item({ id: 14, name: 'Рюкзак', kind: 'container', artifacts: [artifact] });

describe('item modal targets', () => {
  it('maps every openable kind to its card prefix', () => {
    expect(catalogKey('weapon', 'АК-12')).toBe('w:АК-12');
    expect(catalogKey('armor', 'Куница')).toBe('a:Куница');
    expect(catalogKey('artifact', 'Ломоть')).toBe('art:Ломоть');
    expect(catalogKey('container', 'Рюкзак')).toBe('c:Рюкзак');
    expect(catalogKey('modification', 'АКМЛ')).toBe('mod:АКМЛ');
  });

  it('has no card key for a stackable, unknown or unnamed target', () => {
    expect(catalogKey('ammo', 'Патроны')).toBeNull();
    expect(catalogKey(null, 'АК-12')).toBeNull();
    expect(catalogKey('weapon', '  ')).toBeNull();
  });

  it('finds an instance nested inside a weapon or a container', () => {
    const read = inventory([weapon, container]);
    expect(findInstance(read, 11)).toBe(weapon);
    expect(findInstance(read, 12)).toBe(modification);
    expect(findInstance(read, 13)).toBe(artifact);
  });

  it('reports a missing instance and tolerates a missing payload', () => {
    expect(findInstance(inventory([weapon]), 99)).toBeNull();
    expect(findInstance(null, 11)).toBeNull();
  });

  it('builds the catalog row the modal reads', () => {
    expect(
      catalogRow({
        mode: 'catalog',
        kind: 'weapon',
        name: 'АК-12',
        icon: '/icons/a.png',
        rank: 'RANK_MASTER',
        category: 'weapon/assault_rifle',
      }),
    ).toEqual({
      name: 'АК-12',
      kind: 'weapon',
      type: 'weapon/assault_rifle',
      icon: '/icons/a.png',
      rank: 'RANK_MASTER',
      instanceId: null,
    });
  });

  it('keeps the deep-link href for chips and bookmarks', () => {
    expect(itemPageHref('weapon', 42, 'АК-12')).toBe('/weapons?item=42');
    expect(itemPageHref('modification', null, 'АКМЛ')).toBe(
      `/modifications?mode=catalog&name=${encodeURIComponent('АКМЛ')}`,
    );
    expect(itemPageHref('ammo', null, 'Патроны')).toBeNull();
  });
});
