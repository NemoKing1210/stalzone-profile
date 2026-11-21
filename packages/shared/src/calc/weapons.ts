import { round } from '../format.js';

/** The dummy-health baseline every displayed TTK defaults to. */
export const DUMMY_HP = 600;

/** The five fields a damage-falloff point needs; a half-filled curve is no data. */
export interface DamagePointLike {
  d0: number | null;
  dB: number | null;
  distA: number | null;
  distB: number | null;
  distMax: number | null;
}

export function completeDamagePoint<T extends DamagePointLike>(point: T | null | undefined): T | null {
  if (!point) return null;
  const values = [point.d0, point.dB, point.distA, point.distB, point.distMax];
  return values.every((value) => value != null && Number.isFinite(value)) ? point : null;
}

/** DPS = damage × rounds per minute / 60, one decimal. */
export function dps(damage: number | null | undefined, rof: number | null | undefined): number | null {
  if (!damage || !rof) return null;
  return round((damage * rof) / 60, 1);
}

/** Damage as the profile shows it: one decimal. */
export function displayDmg(damage: number | null | undefined): number | null {
  if (damage == null || !Number.isFinite(damage)) return null;
  return round(damage, 1);
}

/** DPS from the displayed damage, rounded to a whole number (legacy parity). */
export function displayDps(damage: number | null | undefined, rof: number | null | undefined): number | null {
  const shown = displayDmg(damage);
  if (shown == null || !rof || !Number.isFinite(rof)) return null;
  return Math.round((shown * rof) / 60);
}

/** TTK on the dummy: ceil(HP/damage) shots, (n−1) × 60/rpm seconds. */
export function ttk(damage: number | null | undefined, rof: number | null | undefined, hp = DUMMY_HP): number | null {
  if (!damage || !rof) return null;
  const shots = Math.ceil(hp / damage);
  if (shots <= 1) return 0;
  return round(((shots - 1) * 60) / rof, 2);
}

/** TTK from the displayed damage, so the table and the chart read the same number. */
export function displayTtk(
  damage: number | null | undefined,
  rof: number | null | undefined,
  hp = DUMMY_HP,
): number | null {
  return ttk(displayDmg(damage), rof, hp);
}
