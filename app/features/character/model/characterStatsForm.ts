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

/** Counters the editor treats as whole numbers; the rest stay free text (playtime, registration). */
export const NUMERIC_STAT_FIELDS: readonly StatField[] = ['kil', 'dea', 'sho-fir', 'sho-hit', 'sho-hea', 'ach-gai'];

const NUMERIC_FIELDS = new Set<StatField>(NUMERIC_STAT_FIELDS);

export function isNumericStatField(field: StatField): boolean {
  return NUMERIC_FIELDS.has(field);
}

/** Playtime input: plain hours or an ISO-8601 duration; anything else is not a number. */
export function durationHoursInput(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const text = value.trim();
  if (text === '') return null;
  const plain = Number(text);
  if (Number.isFinite(plain)) return plain >= 0 ? plain : null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(text);
  if (!match) return null;
  return Number(match[1] ?? 0) + Number(match[2] ?? 0) / 60 + Number(match[3] ?? 0) / 3600;
}

/** Registration is one canonical ISO date; the editor sends nothing else. */
export function isIsoDateInput(value: string | null | undefined): boolean {
  const text = value?.trim() ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

/** Turns the editor's inputs into a `stats` patch; every empty input clears the manual override. */
export function toCharacterStatsPatch(form: CharacterStatsForm): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const field of STAT_FIELDS) {
    const value = form[field];
    if (value == null || value === '') {
      out[field] = null;
    } else if (field === 'pla-tim') {
      const hours = durationHoursInput(value);
      out[field] = hours == null ? String(value) : hours;
    } else if (field === 'reg-tim') {
      out[field] = String(value).trim();
    } else if (NUMERIC_FIELDS.has(field) && typeof value === 'string' && Number.isFinite(Number(value))) {
      out[field] = Number(value);
    } else {
      out[field] = value;
    }
  }
  return out;
}
