import { describe, expect, it } from 'vitest';
import { RANK_ORDER } from '@dossier/shared/ranks';
import { RANK_TEXT_COLOR, rankTextColor } from '../../app/shared/lib/rankText';
import { contrast } from './helpers/contrast';

describe('rank text colours', () => {
  it('covers every rank', () => {
    expect(Object.keys(RANK_TEXT_COLOR).sort()).toEqual([...RANK_ORDER].sort());
  });

  it('passes 4.5:1 on both pane surfaces', () => {
    for (const rank of RANK_ORDER) {
      expect(contrast(RANK_TEXT_COLOR[rank], '#161616')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(RANK_TEXT_COLOR[rank], '#1f1f1f')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('normalizes aliases and falls back to body text', () => {
    expect(rankTextColor('RANK_MASTER')).toBe('#e08b84');
    expect(rankTextColor('veteran')).toBe('#c39ce0');
    expect(rankTextColor('unknown')).toBe('#d8d8d3');
    expect(rankTextColor(null)).toBe('#d8d8d3');
  });
});
