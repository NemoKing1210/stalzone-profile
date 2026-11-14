export function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[«»"'`]/g, '')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

export function num(v: number | null | undefined): string {
  return typeof v === 'number' ? v.toLocaleString('ru-RU') : '—';
}

export function g1(v: number | null | undefined): string {
  return v == null ? '—' : Number(v).toFixed(1).replace('.', ',');
}

export function g2(v: number | null | undefined): string {
  return v == null ? '—' : Number(v).toFixed(2).replace('.', ',');
}

export function fmtMoney(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1e6) return (v / 1e6).toFixed(2).replace('.', ',') + ' млн';
  if (v >= 1e3) return Math.round(v / 1e3) + ' тыс.';
  return String(Math.round(v));
}

export function compactNum(v: number | null | undefined): string {
  if (typeof v !== 'number') return '—';
  if (v >= 1e6) return (v / 1e6).toFixed(2).replace('.', ',') + ' млн';
  if (v >= 1e4) return Math.round(v / 1e3).toLocaleString('ru-RU') + ' тыс.';
  return num(v);
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
