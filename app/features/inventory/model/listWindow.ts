/**
 * The list mode renders a window of the already sorted and filtered rows. Grouping is kept:
 * groups consume the window in order, and the rest stays behind one "load more" control.
 * Sorting/filtering still run over the full set before this window is taken.
 */
export interface ListSection<T> {
  key: string;
  label?: string | null;
  rows: T[];
}

export interface ListWindow<T> {
  sections: { key: string; label?: string | null; rows: T[]; total: number }[];
  hidden: number;
}

export function windowSections<T>(sections: readonly ListSection<T>[], limit: number): ListWindow<T> {
  let remaining = Math.max(0, Math.trunc(limit));
  let shown = 0;
  const visible: ListWindow<T>['sections'] = [];
  for (const section of sections) {
    if (remaining <= 0) break;
    const rows = section.rows.slice(0, remaining);
    if (!rows.length) continue;
    visible.push({ key: section.key, label: section.label, rows, total: section.rows.length });
    remaining -= rows.length;
    shown += rows.length;
  }
  const total = sections.reduce((sum, section) => sum + section.rows.length, 0);
  return { sections: visible, hidden: total - shown };
}
