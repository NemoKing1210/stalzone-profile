export function formatDateValue(value: string | null | undefined, locale: string): string {
  if (value == null) return '—';
  const trimmed = value.trim();
  if (!trimmed) return '—';
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  // A fixed zone keeps the server render and the client hydration identical.
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}
