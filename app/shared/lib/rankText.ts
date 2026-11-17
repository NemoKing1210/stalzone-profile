import { rankKey, type RankKey } from '@profile/shared/ranks';

export const RANK_TEXT_COLOR: Record<RankKey, string> = {
  default: '#9aa294',
  newbie: '#63b356',
  stalker: '#4a9fd8',
  veteran: '#c39ce0',
  master: '#e08b84',
  legend: '#e0a63c',
};

export function rankTextColor(raw: string | null | undefined): string {
  const key = rankKey(raw);
  return key ? RANK_TEXT_COLOR[key] : '#d8d8d3';
}
