import { rankKey, type RankKey } from '@profile/shared/ranks';

/** CSS tokens, so rank names stay readable when the light theme swaps the palette. */
export const RANK_TEXT_COLOR: Record<RankKey, string> = {
  default: 'var(--sz-rank-default)',
  newbie: 'var(--sz-rank-newbie)',
  stalker: 'var(--sz-rank-stalker)',
  veteran: 'var(--sz-rank-veteran)',
  master: 'var(--sz-rank-master)',
  legend: 'var(--sz-rank-legend)',
};

export function rankTextColor(raw: string | null | undefined): string {
  const key = rankKey(raw);
  return key ? RANK_TEXT_COLOR[key] : 'var(--sz-text)';
}
