import { describe, expect, it } from 'vitest';

import { barScale } from '~/features/inventory/model/comparisonBars';

const rows = [{ key: 'a', value: 10 }, { key: 'b', value: 20 }, { key: 'c', value: null }];

describe('comparison bars', () => {
  it('returns no bars for an empty or single-row set', () => {
    expect(barScale([], (row: { key: string; value: number | null }) => row.value, 'higher').size).toBe(0);
    expect(barScale([{ key: 'a', value: 10 }], (row) => row.value, 'higher').size).toBe(0);
  });

  it('scales a higher-is-better metric against the maximum and omits nulls', () => {
    const bars = barScale(rows, (row) => row.value, 'higher');
    expect(bars.size).toBe(2);
    expect(bars.get('a')?.ratio).toBeCloseTo(0.5);
    expect(bars.get('b')?.ratio).toBe(1);
    expect(bars.has('c')).toBe(false);
    expect(bars.get('a')?.color).not.toBe(bars.get('b')?.color);
  });

  it('keeps a lower-is-better metric shorter for the better value', () => {
    const bars = barScale(rows, (row) => row.value, 'lower');
    expect(bars.get('a')!.ratio).toBeLessThan(bars.get('b')!.ratio);
    expect(bars.get('a')!.color).toBe('var(--sz-success)');
  });

  it('gives ties one equal bar', () => {
    const bars = barScale(
      [
        { key: 'a', value: 5 },
        { key: 'b', value: 5 },
      ],
      (row) => row.value,
      'higher',
    );
    expect(bars.get('a')).toEqual(bars.get('b'));
  });

  it('reports no bars when every value is null', () => {
    expect(barScale(rows, () => null, 'higher').size).toBe(0);
  });
});
