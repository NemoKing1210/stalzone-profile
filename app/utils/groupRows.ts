export interface RowGroup<T> {
  key: string;
  label: string;
  rows: T[];
}

/** Groups rows by a string key, sorts groups by label and keeps the fallback last. */
export function groupRows<T>(
  rows: T[],
  keyOf: (row: T) => string | null | undefined,
  fallbackLabel: string,
  locale = 'ru',
): RowGroup<T>[] {
  const groups = new Map<string, RowGroup<T>>();
  for (const row of rows) {
    const raw = keyOf(row);
    const label = typeof raw === 'string' && raw.trim() ? raw.trim() : fallbackLabel;
    const group = groups.get(label) ?? { key: label, label, rows: [] };
    group.rows.push(row);
    groups.set(label, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.label === fallbackLabel) return 1;
    if (b.label === fallbackLabel) return -1;
    return a.label.localeCompare(b.label, locale, { numeric: true });
  });
}
