import { describe, expect, it } from 'vitest';

import { itemEdgeColor } from '~/shared/lib/rankBorder';

const RANKS = [
  ['default', 'var(--sz-rank-default)'],
  ['newbie', 'var(--sz-rank-newbie)'],
  ['stalker', 'var(--sz-rank-stalker)'],
  ['veteran', 'var(--sz-rank-veteran)'],
  ['master', 'var(--sz-rank-master)'],
  ['legend', 'var(--sz-rank-legend)'],
] as const;

describe('itemEdgeColor', () => {
  it('mixes every rank token into a translucent edge', () => {
    for (const [rank, token] of RANKS) {
      expect(itemEdgeColor(rank)).toBe(`color-mix(in srgb, ${token} 70%, transparent)`);
    }
  });

  it('accepts EXBO rank spellings and is case-insensitive', () => {
    expect(itemEdgeColor('RANK_MASTER')).toBe('color-mix(in srgb, var(--sz-rank-master) 70%, transparent)');
    expect(itemEdgeColor('Legend')).toBe('color-mix(in srgb, var(--sz-rank-legend) 70%, transparent)');
  });

  it('falls back to the strong border for a missing or unknown rank', () => {
    expect(itemEdgeColor(null)).toBe('var(--sz-border-strong)');
    expect(itemEdgeColor(undefined)).toBe('var(--sz-border-strong)');
    expect(itemEdgeColor('common')).toBe('var(--sz-border-strong)');
    expect(itemEdgeColor('')).toBe('var(--sz-border-strong)');
  });
});
