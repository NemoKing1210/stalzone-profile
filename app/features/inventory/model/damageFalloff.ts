import type { DamagePoint } from '@profile/shared/contracts';

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
  level: 0 | 15;
  label: string;
  color: string;
  dashed: boolean;
  d: string;
  points: FalloffPlotPoint[];
}

export interface FalloffPlot {
  view: FalloffView;
  lines: FalloffPlotLine[];
  legend: FalloffPlotLine[];
  xTicks: { x: number; label: string }[];
  yTicks: { y: number; label: string }[];
  yGrid: number[];
  points: { key: string; label: string; distance: number; damage: number }[];
}

function validValue(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= 0;
}

/**
 * A flat–linear–flat curve from one game damage point: full damage to `distA`, linear to
 * `distB`, then `dB` to `distMax`. Any missing or invalid field skips the series; nothing is
 * interpolated or filled in.
 */
function seriesFor(point: DamagePoint | null | undefined, level: 0 | 15): FalloffSeries | null {
  if (!point) return null;
  const { d0, dB, distA, distB, distMax } = point;
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
  const points = raw.filter(
    (entry, index) => index === 0 || entry.distance !== raw[index - 1]!.distance || entry.damage !== raw[index - 1]!.damage,
  );
  return { level, points };
}

export function damageFalloff(card: FalloffCard | null | undefined): FalloffData | null {
  if (!card) return null;
  const series = [seriesFor(card.p0, 0), seriesFor(card.p15, 15)].filter(
    (entry): entry is FalloffSeries => entry !== null,
  );
  if (!series.length) return null;
  const points = series.flatMap((entry) => entry.points);
  return {
    series,
    maxDistance: Math.max(...points.map((point) => point.distance)),
    maxDamage: Math.max(...points.map((point) => point.damage)),
  };
}
