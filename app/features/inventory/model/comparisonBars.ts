export type BarMode = 'higher' | 'lower';

export interface BarValue {
  /** 0..1; the bar length. A lower-is-better metric keeps the shorter bar. */
  ratio: number;
  color: string;
}

const SUCCESS = 'var(--sz-success)';
const WARNING = 'var(--sz-warning)';
const DANGER = 'var(--sz-danger)';

function colorFor(quality: number): string {
  if (quality >= 0.75) return SUCCESS;
  if (quality >= 0.4) return WARNING;
  return DANGER;
}

/**
 * Bar lengths are relative to the best value in the visible set. `higher` makes the
 * largest value the full bar; `lower` keeps the length as value/max so the shortest
 * bar is the best (TTK). Nulls and a one-row set produce no bars at all.
 */
export function barScale<T extends { key: string }>(
  rows: readonly T[],
  read: (row: T) => number | null | undefined,
  mode: BarMode,
): Map<string, BarValue> {
  const bars = new Map<string, BarValue>();
  if (rows.length < 2) return bars;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const value = read(row);
    if (value == null || !Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return bars;

  for (const row of rows) {
    const value = read(row);
    if (value == null || !Number.isFinite(value)) continue;
    const ratio = max > 0 ? value / max : 0;
    const quality =
      max === min ? 1 : mode === 'higher' ? (value - min) / (max - min) : 1 - (value - min) / (max - min);
    bars.set(row.key, { ratio: Math.min(1, Math.max(0, ratio)), color: colorFor(quality) });
  }
  return bars;
}
