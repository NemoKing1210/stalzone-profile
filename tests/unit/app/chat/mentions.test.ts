import type {
  ChatSendRef,
  InventoryItemRead,
  InventoryRead,
  RangeValue,
} from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';

import {
  inventoryCandidates,
  mentionQueryAt,
  mergeCandidates,
  pruneMentionRefs,
  rankCandidates,
  replaceMention,
} from '~/features/chat/model/mentions';

const range: RangeValue = { min: 0, max: 0, value: 0, missing: [] };

function item(
  partial: Partial<InventoryItemRead> & Pick<InventoryItemRead, 'id' | 'name' | 'kind'>,
): InventoryItemRead {
  return {
    itemId: partial.id,
    displayName: null,
    category: null,
    rank: 'common',
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
    size: { width: 1, height: 1 },
    placement: { location: 'loose' },
    container: null,
    ...partial,
  };
}

const inventory: InventoryRead = {
  storages: [
    {
      id: 1,
      kind: 'inventory',
      name: 'Inventory',
      width: 8,
      height: 10,
      maxWeight: null,
      sortOrder: 0,
      items: [
        item({ id: 11, name: 'АК-12', kind: 'weapon', level: 12, placement: { location: 'grid', storageId: 1, x: 0, y: 0 } }),
        item({ id: 12, name: 'АК-12', kind: 'weapon', level: 7, placement: { location: 'grid', storageId: 1, x: 3, y: 0 } }),
        item({ id: 13, name: 'Патроны 5.45', kind: 'ammo', qty: 60 }),
      ],
      weight: range,
      updatedAt: null,
    },
  ],
  equipment: {
    primary: null,
    secondary: null,
    melee: null,
    armor: item({ id: 22, name: 'Куница', kind: 'armor', placement: { location: 'equipment', slot: 'armor' } }),
    backpack: null,
    container: null,
    quick1: null,
    quick2: null,
    quick3: null,
    quick4: null,
  },
  loose: [],
  stats: {
    carry: {
      base: 50,
      bonus: range,
      total: range,
      safeLimit: range,
      carried: range,
      aboveSafe: null,
      overweight: null,
    },
    storages: {},
    protection: {},
    effects: {},
    containers: [],
    warnings: [],
  },
  updatedAt: null,
};

const ref = (token: string, itemId: number): ChatSendRef => ({ token, kind: 'weapon', itemId });

describe('item mention composer', () => {
  it('finds the active mention query at the caret', () => {
    expect(mentionQueryAt('сравни @weapon:ак', 17)).toEqual({
      start: 7,
      end: 17,
      query: 'weapon:ак',
      kind: 'weapon',
    });
    expect(mentionQueryAt('@ак', 3)).toEqual({ start: 0, end: 3, query: 'ак', kind: null });
    expect(mentionQueryAt('сравни @weapon:ак дальше', 17)).toMatchObject({ end: 17, query: 'weapon:ак' });
    expect(mentionQueryAt('a@weapon:ак', 11)).toBeNull();
    expect(mentionQueryAt('@weapon:ак ', 12)).toBeNull();
    expect(mentionQueryAt('без упоминания', 14)).toBeNull();
  });

  it('replaces the query and keeps the caret after the inserted token', () => {
    const range = { start: 7, end: 17, query: 'weapon:ак' };
    expect(replaceMention('сравни @weapon:ак дальше', range, '@weapon:ак-12')).toEqual({
      text: 'сравни @weapon:ак-12 дальше',
      caret: 20,
    });
    expect(replaceMention('сравни @weapon:ак', range, '@weapon:ак-12')).toEqual({
      text: 'сравни @weapon:ак-12 ',
      caret: 21,
    });
  });

  it('drops a reference whose token was edited out', () => {
    const refs = [ref('@weapon:ак-12', 11), ref('@weapon:кс-1', 21)];
    expect(pruneMentionRefs('оставь @weapon:ак-12', refs).map((entry) => entry.token)).toEqual([
      '@weapon:ак-12',
    ]);
  });

  it('ranks pinned first, then exact, then prefix, then substring', () => {
    const candidates = [
      { token: '@weapon:ак-12~21', kind: 'weapon' as const, itemId: 21, instanceId: null, name: 'АК-12М', rank: null, icon: null, level: null, quality: null, virtual: false, source: 'catalog' as const },
      { token: '@weapon:ак-12#11', kind: 'weapon' as const, itemId: 11, instanceId: 11, name: 'АК-12', rank: null, icon: null, level: 12, quality: null, virtual: false, source: 'owned' as const },
      { token: '@weapon:ак-12', kind: 'weapon' as const, itemId: 11, instanceId: null, name: 'АК-12', rank: null, icon: null, level: null, quality: null, virtual: false, source: 'pinned' as const },
      { token: '@weapon:ак-74', kind: 'weapon' as const, itemId: 31, instanceId: null, name: 'АК-74', rank: null, icon: null, level: null, quality: null, virtual: false, source: 'catalog' as const },
    ];
    expect(rankCandidates('ак-12', candidates).map((entry) => entry.token)).toEqual([
      '@weapon:ак-12',
      '@weapon:ак-12#11',
      '@weapon:ак-12~21',
    ]);
  });

  it('keeps one candidate per identity and prefers the pinned copy', () => {
    const owned = {
      token: '@weapon:ак-12#11',
      kind: 'weapon' as const,
      itemId: 11,
      instanceId: 11,
      name: 'АК-12',
      rank: null,
      icon: null,
      level: 12,
      quality: null,
      virtual: false,
      source: 'owned' as const,
    };
    expect(mergeCandidates([{ ...owned, source: 'pinned' }, owned])).toEqual([
      { ...owned, source: 'pinned' },
    ]);
  });

  it('builds owned candidates from the inventory and skips unsupported kinds', () => {
    const tokens = inventoryCandidates(inventory).map((candidate) => [candidate.name, candidate.token]);
    expect(tokens).toEqual([
      ['Куница', '@armor:куница#22'],
      ['АК-12', '@weapon:ак-12#11'],
      ['АК-12', '@weapon:ак-12#12'],
    ]);
    expect(inventoryCandidates(inventory).every((candidate) => candidate.source === 'owned')).toBe(true);
  });
});
