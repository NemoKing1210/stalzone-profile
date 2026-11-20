import { describe, expect, it } from 'vitest';
import { RANK_ORDER } from '@profile/shared/ranks';
import { RANK_TEXT_COLOR, rankTextColor } from '../../app/shared/lib/rankText';
import { THEME_TOKENS } from '../../app/shared/lib/theme';
import { contrast } from './helpers/contrast';

describe('rank text colours', () => {
  it('covers every rank with a theme token', () => {
    expect(Object.keys(RANK_TEXT_COLOR).sort()).toEqual([...RANK_ORDER].sort());
    for (const rank of RANK_ORDER) expect(RANK_TEXT_COLOR[rank]).toMatch(/^var\(--sz-rank-/);
  });

  it('passes 4.5:1 on both pane surfaces in both themes', () => {
    for (const theme of ['dark', 'light'] as const) {
      const tokens = THEME_TOKENS[theme];
      for (const rank of RANK_ORDER) {
        const color = tokens[`--sz-rank-${rank}`]!;
        const surface = theme === 'dark' ? '#1f1f1f' : tokens['--sz-surface']!;
        expect(contrast(color, surface), `${theme} ${rank}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('normalizes aliases and falls back to body text', () => {
    expect(rankTextColor('RANK_MASTER')).toBe('var(--sz-rank-master)');
    expect(rankTextColor('veteran')).toBe('var(--sz-rank-veteran)');
    expect(rankTextColor('unknown')).toBe('var(--sz-text)');
    expect(rankTextColor(null)).toBe('var(--sz-text)');
  });
});
