import { describe, expect, it } from 'vitest';

import { findRowForDeepLink, parseInventoryDeepLink, withoutInventoryDeepLink } from '~/features/inventory/model/deepLink';

const rows = [
  { instanceId: 42, name: 'AA-12' },
  { instanceId: null, name: 'АК-12' },
];

describe('inventory deep links', () => {
  it('parses an owned instance id', () => {
    expect(parseInventoryDeepLink({ item: '42' })).toEqual({ itemId: 42, name: null, mode: null });
  });

  it('parses a catalog row by name', () => {
    expect(parseInventoryDeepLink({ mode: 'catalog', name: 'АК-12' })).toEqual({
      itemId: null,
      name: 'АК-12',
      mode: 'catalog',
    });
  });

  it('ignores an empty or malformed link', () => {
    expect(parseInventoryDeepLink({})).toBeNull();
    expect(parseInventoryDeepLink({ item: 'abc' })).toBeNull();
    expect(parseInventoryDeepLink({ mode: 'catalog' })).toBeNull();
  });

  it('finds the owned row first and falls back to the catalog name', () => {
    const owned = parseInventoryDeepLink({ item: '42' });
    const catalog = parseInventoryDeepLink({ mode: 'catalog', name: 'АК-12' });
    expect(owned && findRowForDeepLink(rows, owned)).toEqual(rows[0]);
    expect(catalog && findRowForDeepLink(rows, catalog)).toEqual(rows[1]);
  });

  it('clears only the deep-link keys', () => {
    expect(withoutInventoryDeepLink({ item: '42', add: '1', tab: 'x' })).toEqual({ add: '1', tab: 'x' });
  });
});
