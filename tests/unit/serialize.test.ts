import { describe, expect, it } from 'vitest';
import type { ItemRow } from '@dossier/core';
import { itemJson } from '../../server/utils/serialize';

const item = {
  id: 1,
  external_id: 'exbo-ak-12',
  name: 'АК-12',
  name_en: null,
  kind: 'weapon',
  category: 'weapon/assault_rifle',
  rank: 'RANK_MASTER',
  slot: 'основное',
  weight: 3.8,
  is_cosmetic: 0,
} as ItemRow;

describe('serialize', () => {
  it('serializes an item without raw or quality and includes typed effects', () => {
    const json = itemJson(item, {
      stats: [{ stat_id: 'damage.start', value_num: 40 }],
      effects: [{ position: 0, label: 'Скорость', is_positive: 1 }],
    });
    expect(json).not.toHaveProperty('raw');
    expect(json).not.toHaveProperty('quality');
    expect(json.effects).toEqual([{ position: 0, label: 'Скорость', is_positive: 1 }]);
  });
});
