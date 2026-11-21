import type { DamagePoint } from '@profile/shared/contracts';

import { falloffPoints, type FalloffPoint } from './damageFalloff';

/** The number of `--sz-series-*` tokens the chart cycles through. */
export const SERIES_COLORS = 10;

export interface WeaponChartRow {
  key: string;
  name: string;
  rof: number | null;
  p0: DamagePoint | null;
  p15: DamagePoint | null;
}

export interface WeaponChartSeries {
  key: string;
  name: string;
  color: string;
  points: FalloffPoint[];
  /** Distance where the damage stops falling; the drawn curve ends here. */
  falloffEnd: number;
  /** The weapon's own maximum range; constant damage continues to here. */
  maxDistance: number;
}

export interface WeaponChart {
  series: WeaponChartSeries[];
  maxDistance: number;
  maxDamage: number;
  /** Five evenly spaced values, from zero to the widest curve. */
  xTicks: number[];
  /** Five evenly spaced values, from zero to the strongest curve. */
  yTicks: number[];
}

/**
 * The axes of a set of curves; the panel recomputes it for the visible subset. The x axis
 * ends at the furthest falloff end, not the furthest maximum range: past that point every
 * curve is flat, so plotting the constant tail only shrinks the part that carries shape.
 */
export function chartScale(
  series: readonly { falloffEnd: number; points: readonly FalloffPoint[] }[],
): Omit<WeaponChart, 'series'> | null {
  if (!series.length) return null;
  const maxDistance = Math.max(...series.map((entry) => entry.falloffEnd));
  const maxDamage = Math.max(...series.flatMap((entry) => entry.points).map((point) => point.damage));
  const ticks = (max: number): number[] => [0, max / 4, max / 2, (max * 3) / 4, max];
  return { maxDistance, maxDamage, xTicks: ticks(maxDistance), yTicks: ticks(maxDamage) };
}

/** The color is fixed by the row's place in the list, so toggling a series never recolors the rest. */
export function seriesColor(index: number): string {
  return `var(--sz-series-${(index % SERIES_COLORS) + 1})`;
}

/** One curve per plottable row; rows without a complete point are skipped, not guessed. */
export function buildWeaponChart(rows: readonly WeaponChartRow[], level: 0 | 15): WeaponChart | null {
  const series = rows.flatMap((row, index) => {
    const point = level === 15 ? row.p15 : row.p0;
    const points = falloffPoints(point);
    if (!points || point?.distB == null || point.distMax == null) return [];
    return [
      {
        key: row.key,
        name: row.name,
        color: seriesColor(index),
        points,
        falloffEnd: point.distB,
        maxDistance: point.distMax,
      },
    ];
  });
  if (!series.length) return null;

  const scale = chartScale(series);
  return scale ? { series, ...scale } : null;
}
