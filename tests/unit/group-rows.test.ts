import { describe, expect, it } from 'vitest';
import { groupRows } from '../../app/utils/groupRows';

interface Row {
  name: string;
  type: string | null;
}

const keyOf = (row: Row) => row.type;

describe('groupRows', () => {
  it('sorts groups by label and keeps row order inside a group', () => {
    const rows: Row[] = [
      { name: 'b1', type: 'Beta' },
      { name: 'a1', type: 'Alpha' },
      { name: 'b2', type: 'Beta' },
    ];

    expect(groupRows(rows, keyOf, 'No type')).toEqual([
      { key: 'Alpha', label: 'Alpha', rows: [rows[1]] },
      { key: 'Beta', label: 'Beta', rows: [rows[0], rows[2]] },
    ]);
  });

  it('puts the fallback group last and merges empty values into it', () => {
    const rows: Row[] = [
      { name: 'none', type: null },
      { name: 'a', type: 'Alpha' },
      { name: 'blank', type: '   ' },
      { name: 'missing', type: undefined as unknown as null },
    ];

    const groups = groupRows(rows, keyOf, 'No type');
    expect(groups.map((group) => group.label)).toEqual(['Alpha', 'No type']);
    expect(groups[1].rows.map((row) => row.name)).toEqual(['none', 'blank', 'missing']);
  });

  it('returns an empty array for empty input', () => {
    expect(groupRows<Row>([], keyOf, 'No type')).toEqual([]);
  });
});
