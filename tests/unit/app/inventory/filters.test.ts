import { describe, expect, it } from 'vitest';
import { ALL_RANKS } from '~/entities/item/model/rankOptions';
import {
  filterInventoryRows,
  inventorySections,
  resolveSortKey,
  typeOptions,
} from '~/features/inventory/model/filters';

interface Row {
  key: string;
  name: string;
  rank: string | null;
  type: string | null;
}

const rows: Row[] = [
  { key: 'a', name: 'AK', rank: 'common', type: 'rifle' },
  { key: 'b', name: 'PM', rank: 'common', type: null },
];
const groupKey = (row: Row) => row.type;

describe('inventory filters', () => {
  it('returns no rows for an empty catalog', () => {
    expect(filterInventoryRows<Row>([], { q: '', rank: ALL_RANKS, type: 'all' }, ['name'], groupKey)).toEqual([]);
  });

  it('returns no rows in catalog mode when nothing matches the type filter', () => {
    expect(filterInventoryRows([], { q: '', rank: ALL_RANKS, type: 'rifle' }, ['name'], groupKey)).toEqual([]);
  });

  it('falls back to the default sort key when the persisted one is unknown', () => {
    expect(resolveSortKey('price', ['dps', 'name'], 'dps')).toBe('dps');
    expect(resolveSortKey('name', ['dps', 'name'], 'dps')).toBe('name');
  });

  it('keeps only the all-types option when there is no catalog data', () => {
    expect(typeOptions([], groupKey, 'All types')).toEqual([{ label: 'All types', value: 'all' }]);
  });

  it('puts a null group key in the fallback group', () => {
    const sections = inventorySections(rows, 'type', groupKey, 'No type');
    expect(sections.map((section) => section.label)).toEqual(['rifle', 'No type']);
    expect(sections[1].rows.map((row) => row.name)).toEqual(['PM']);
  });
});
