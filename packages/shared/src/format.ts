export function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[«»"'`]/g, '')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function usesComma(locale: string): boolean {
  return locale.toLowerCase().startsWith('ru');
}

function fixed(value: number, digits: number, locale: string): string {
  const text = value.toFixed(digits);
  return usesComma(locale) ? text.replace('.', ',') : text;
}

export function num(v: number | null | undefined, locale = 'en-US'): string {
  return typeof v === 'number' ? v.toLocaleString(locale) : '—';
}

export function g1(v: number | null | undefined, locale = 'en-US'): string {
  return v == null ? '—' : fixed(Number(v), 1, locale);
}

export function g2(v: number | null | undefined, locale = 'en-US'): string {
  return v == null ? '—' : fixed(Number(v), 2, locale);
}

/** Up to `digits` decimals with trailing zeros trimmed; keeps the stored precision. */
export function dec(v: number | null | undefined, locale = 'en-US', digits = 2): string {
  if (v == null) return '—';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(Number(v));
}

export function fmtMoney(v: number | null | undefined, locale = 'en-US'): string {
  if (v == null) return '—';
  const ru = usesComma(locale);
  if (v >= 1e6) return fixed(v / 1e6, 2, locale) + (ru ? ' млн' : 'M');
  if (v >= 1e3) return Math.round(v / 1e3) + (ru ? ' тыс.' : 'K');
  return String(Math.round(v));
}

export function compactNum(v: number | null | undefined, locale = 'en-US'): string {
  if (typeof v !== 'number') return '—';
  const ru = usesComma(locale);
  if (v >= 1e6) return fixed(v / 1e6, 2, locale) + (ru ? ' млн' : 'M');
  if (v >= 1e4) return Math.round(v / 1e3).toLocaleString(locale) + (ru ? ' тыс.' : 'K');
  return num(v, locale);
}

/** Rounds to `digits` decimals without negative-zero surprises. */
export function round(v: number, digits = 1): number {
  const k = 10 ** digits;
  const r = Math.round((v + Number.EPSILON) * k) / k;
  return Object.is(r, -0) ? 0 : r;
}

export function slugify(s: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return String(s ?? '')
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function isoNow(): string {
  return new Date().toISOString();
}
