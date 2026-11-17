import { round } from '@profile/shared';
import type { StalzoneProfileStat } from '@profile/sources';
import { parseIsoDurationHours } from '../../identity/index.js';

/** Counters the public profile provides as numbers. */
const NUMERIC = new Set(['kil', 'dea', 'sho-fir', 'sho-hit', 'sho-hea', 'ach-gai']);

/** Playtime arrives as seconds or an ISO-8601 duration; both become hours. */
export function durationHours(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? round(value / 3600, 2) : null;
  if (typeof value === 'string') return parseIsoDurationHours(value);
  return null;
}

export interface ProfileStats {
  numeric: Record<string, number>;
  text: Record<string, string>;
}

/** Splits profile counters into the numeric and text columns of `character_stat`. */
export function mapProfileStats(stats: StalzoneProfileStat[]): ProfileStats {
  const numeric: Record<string, number> = {};
  const text: Record<string, string> = {};
  for (const stat of stats) {
    if (stat.id === 'pla-tim') {
      const hours = durationHours(stat.value);
      if (hours != null) numeric['pla-tim'] = hours;
      continue;
    }
    if (NUMERIC.has(stat.id) && typeof stat.value === 'number' && Number.isFinite(stat.value)) {
      numeric[stat.id] = stat.value;
      continue;
    }
    if (stat.id === 'reg-tim' && typeof stat.value === 'string' && stat.value.trim() !== '') {
      text['reg-tim'] = stat.value.trim();
    }
  }
  return { numeric, text };
}
