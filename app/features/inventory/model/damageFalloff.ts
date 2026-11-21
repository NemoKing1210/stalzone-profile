import type { DamagePoint } from '@profile/shared/contracts';
import { completeDamagePoint } from '@profile/shared/calc';

export interface FalloffPoint {
  distance: number;
  damage: number;
}

export interface FalloffSeries {
  level: 0 | 15;
  points: FalloffPoint[];
}

export interface FalloffData {
  series: FalloffSeries[];
  maxDistance: number;
  maxDamage: number;
}

export interface FalloffCard {
  p0?: DamagePoint | null;
  p15?: DamagePoint | null;
}

/** Geometry of one rendered plot: the `viewBox`, its insets, and the text/marker scale. */
export interface FalloffView {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  font: number;
  marker: number;
}

export interface FalloffPlotPoint {
  key: string;
  x: number;
  y: number;
  /** The full sentence for the hover title and the screen-reader list. */
  label: string;
  distance: number;
  damage: number;
}

export interface FalloffPlotLine {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  d: string;
  points: FalloffPlotPoint[];
}

/** One SVG canvas: any number of series sharing axes, ticks and captions. */
export interface FalloffPlot {
  view: FalloffView;
  title: string;
  description: string;
  lines: FalloffPlotLine[];
  xTicks: { x: number; label: string }[];
  yTicks: { y: number; label: string }[];
  yGrid: number[];
  xTitle: string;
  yTitle: string;
}

function validValue(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= 0;
}

/**
 * A flat–linear–flat curve from one game damage point: full damage to `distA`, linear to
 * `distB`, then `dB` to `distMax`. Any missing or invalid field skips the series; nothing is
 * interpolated or filled in.
 */
export function falloffPoints(point: DamagePoint | null | undefined): FalloffPoint[] | null {
  if (!completeDamagePoint(point)) return null;
  const { d0, dB, distA, distB, distMax } = point!;
  if (!validValue(d0) || !validValue(dB) || !validValue(distA) || !validValue(distB) || !validValue(distMax)) {
    return null;
  }
  if (distMax <= 0 || distA > distB || distB > distMax) return null;

  const raw: FalloffPoint[] = [
    { distance: 0, damage: d0 },
    { distance: distA, damage: d0 },
    { distance: distB, damage: dB },
    { distance: distMax, damage: dB },
  ];
  // `distA = 0` repeats the first point exactly; a duplicate would only lengthen the path.
  return raw.filter(
    (entry, index) => index === 0 || entry.distance !== raw[index - 1]!.distance || entry.damage !== raw[index - 1]!.damage,
  );
}

export function damageFalloff(card: FalloffCard | null | undefined): FalloffData | null {
  if (!card) return null;
  const series = ([
    [card.p0, 0],
    [card.p15, 15],
  ] as const).flatMap(([point, level]) => {
    const points = falloffPoints(point);
    return points ? [{ level, points }] : [];
  });
  if (!series.length) return null;
  const points = series.flatMap((entry) => entry.points);
  return {
    series,
    maxDistance: Math.max(...points.map((point) => point.distance)),
    maxDamage: Math.max(...points.map((point) => point.damage)),
  };
}

/**
 * Damage the piecewise-linear curve reads at `distance`. Distances outside the curve clamp
 * to its end points, which is what the chart draws; no other point is invented.
 */
export function damageAtDistance(points: readonly FalloffPoint[], distance: number): number | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || !Number.isFinite(distance)) return null;
  if (distance <= first.distance) return first.damage;
  if (distance >= last.distance) return last.damage;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1]!;
    const right = points[index]!;
    if (distance > right.distance) continue;
    const span = right.distance - left.distance;
    if (span <= 0) return right.damage;
    return left.damage + ((distance - left.distance) / span) * (right.damage - left.damage);
  }
  return last.damage;
}
