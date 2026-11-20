import type { InventoryItemRead } from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';

import { detailKind, detailRows } from '~/features/inventory/model/details';

function item(overrides: Partial<InventoryItemRead> = {}): InventoryItemRead {
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

const keys = (kind: string, options: Parameters<typeof detailRows>[1]) =>
  detailRows(kind, options).map((row) => row.key);

describe('detailRows', () => {
  it('shows a weapon its combat stats', () => {
    const rows = detailRows('weapon', {
      item: item({ level: 3, weight: 3.8 }),
      card: { type: 'Assault rifle', caliber: '5.45', mag: 30, rof: 600, dps15: 1200, ttk15: 0.4 },
    });
    expect(rows.map((row) => row.key)).toEqual(['type', 'caliber', 'mag', 'rof', 'dps15', 'ttk15', 'weight']);
    expect(rows.every((row) => row.value !== null && row.value !== '')).toBe(true);
  });

  it('omits a missing value instead of showing zero', () => {
    const rows = detailRows('weapon', { item: item(), card: { caliber: '5.45' } });
    expect(rows.map((row) => row.key)).toEqual(['caliber']);
  });

  it('gives each kind its own stat set', () => {
    expect(keys('armor', { card: { cls: 'Heavy' }, row: { armor: 80, armor15: 120 } })).toEqual([
      'cls',
      'armor',
      'armor15',
    ]);
    expect(keys('artifact', { item: item({ kind: 'artifact', rarityPct: 42, weight: 0.1 }) })).toEqual([
      'rarityPct',
      'weight',
    ]);
    expect(keys('container', { card: { slots: 5, eff: 90 } })).toEqual(['slots', 'eff']);
    expect(keys('attachment', { item: item({ kind: 'attachment', slot: 'scope', weight: 0.3 }) })).toEqual([
      'slot',
      'weight',
    ]);
  });

  it('reads the container tooling from the instance', () => {
    const rows = detailRows('container', {
      item: item({
        kind: 'container',
        weight: 1.2,
        container: { type: 'Backpack', shield: null, bonus: null, protection: 4, slots: 3, eff: 75 },
      }),
    });
    expect(rows.map((row) => [row.key, row.value])).toEqual([
      ['type', 'Backpack'],
      ['slots', 3],
      ['eff', 75],
      ['prot', 4],
      ['weight', 1.2],
    ]);
  });

  it('falls back to the generic set for an unknown kind', () => {
    expect(keys('mystery', { card: { type: 'Thing', weight: 1 } })).toEqual(['type', 'weight']);
    expect(detailKind('mystery')).toBe('other');
  });
});
