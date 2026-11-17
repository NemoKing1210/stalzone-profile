import { round } from '@dossier/shared';

export type CharacterStatOrigin = 'api' | 'manual';

export interface CharacterStat {
  stat_id: string;
  value_num: number | null;
  value_text: string | null;
  origin: CharacterStatOrigin;
  fetched_at: string;
}

export interface EffectiveStat {
  value: number | string;
  origin: CharacterStatOrigin;
  fetchedAt: string;
}

export interface DerivedCharacterFields {
  arrived: string | null;
  hours: number | null;
  kd: number | null;
  accuracy: number | null;
  headshot: number | null;
  achievements: number | null;
  achievementPoints: null;
}

/** Manual rows win; a numeric value beats text for arithmetic. */
export function effectiveCharacterStats(rows: CharacterStat[]): Record<string, EffectiveStat> {
  const out: Record<string, EffectiveStat> = {};
  for (const row of rows) {
    if (out[row.stat_id]?.origin === 'manual') continue;
    const value = row.value_num ?? row.value_text;
    if (value == null) continue;
    out[row.stat_id] = { value, origin: row.origin, fetchedAt: row.fetched_at };
  }
  return out;
}

function numeric(stats: Record<string, EffectiveStat>, id: string): number | null {
  const value = stats[id]?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(stats: Record<string, EffectiveStat>, id: string): string | null {
  const value = stats[id]?.value;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function ratio(numerator: number | null, denominator: number | null, scale = 1): number | null {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return round((numerator / denominator) * scale, 2);
}

/** `PT123H`, `PT2H30M` and `PT1H15M30S`; anything else stays unknown. */
export function parseIsoDurationHours(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value.trim());
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  const hours = Number(match[1] ?? 0) + Number(match[2] ?? 0) / 60 + Number(match[3] ?? 0) / 3600;
  return round(hours, 2);
}

export function deriveCharacterFields(stats: Record<string, EffectiveStat>): DerivedCharacterFields {
  const numericPlaytime = numeric(stats, 'pla-tim');
  const textPlaytime = text(stats, 'pla-tim');
  return {
    arrived: text(stats, 'reg-tim'),
    hours: numericPlaytime ?? parseIsoDurationHours(textPlaytime),
    kd: ratio(numeric(stats, 'kil'), numeric(stats, 'dea')),
    accuracy: ratio(numeric(stats, 'sho-hit'), numeric(stats, 'sho-fir'), 100),
    headshot: ratio(numeric(stats, 'sho-hea'), numeric(stats, 'sho-hit'), 100),
    achievements: numeric(stats, 'ach-gai'),
    achievementPoints: null,
  };
}
