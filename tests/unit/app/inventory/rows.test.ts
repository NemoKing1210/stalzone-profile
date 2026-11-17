import { describe, expect, it } from 'vitest';
import { weaponsKind } from '~/features/inventory/model/kinds/weapons';

describe('inventory row mapping', () => {
  it('maps owned and catalog rows without inventing values', () => {
    const payload = {
      weapons: [{ name: 'AK', ownedId: 1, qty: 2, lvl: 15, dps: null }],
      catalog: { weapons: [] },
    } as never;
    const rows = weaponsKind.toRows(payload);
    expect(rows[0]).toMatchObject({ name: 'AK', ownedId: 1, qty: 2, dps: null });
    expect(rows[0].key).toBeTruthy();
  });

  it('returns an empty array for a missing section', () => {
    expect(weaponsKind.toRows({} as never)).toEqual([]);
  });

  it('maps catalog rows with the +15 numbers and no owned-only fields', () => {
    const payload = {
      weapons: [],
      catalog: { weapons: [{ name: 'M4', dps15: 100, dmg15: 10, rank: 'rare', type: 'rifle' }] },
    } as never;
    const rows = weaponsKind.toRows(payload, 'catalog');
    expect(rows[0]).toMatchObject({ name: 'M4', ownedId: null, lvl: null, dps: 100, dmg: 10 });
  });
});
