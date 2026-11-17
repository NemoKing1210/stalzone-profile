/**
 * Raw character counters the owner can edit. Derived values (K/D, accuracy,
 * headshot share, hours) are computed on read from these and are never sent back.
 */
export const STAT_FIELDS = [
  'kil',
  'dea',
  'sho-fir',
  'sho-hit',
  'sho-hea',
  'pla-tim',
  'ach-gai',
  'reg-tim',
] as const;

export type StatField = (typeof STAT_FIELDS)[number];

export type CharacterStatsForm = Partial<Record<StatField, string | number | null | undefined>>;

const NUMERIC_FIELDS = new Set<StatField>(['kil', 'dea', 'sho-fir', 'sho-hit', 'sho-hea', 'ach-gai']);

/** Turns the editor's inputs into a `stats` patch; every empty input clears the manual override. */
export function toCharacterStatsPatch(form: CharacterStatsForm): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const field of STAT_FIELDS) {
    const value = form[field];
    if (value == null || value === '') {
      out[field] = null;
    } else if (NUMERIC_FIELDS.has(field) && typeof value === 'string' && Number.isFinite(Number(value))) {
      out[field] = Number(value);
    } else {
      out[field] = value;
    }
  }
  return out;
}
