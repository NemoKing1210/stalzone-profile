import { round } from '@dossier/shared';

export const DUMMY_HP = 600;

export interface WeaponStatLike {
  key: string;
  level: number;
  value_num: number | null;
}

/** DPS = damage × rounds per minute / 60, one decimal. */
export function dps(damage: number | null | undefined, rof: number | null | undefined): number | null {
  if (!damage || !rof) return null;
  return round((damage * rof) / 60, 1);
}

/** TTK on a 600 HP dummy: ceil(600/damage) shots, (n−1) × 60/rpm seconds. */
export function ttk(
  damage: number | null | undefined,
  rof: number | null | undefined,
  hp = DUMMY_HP,
): number | null {
  if (!damage || !rof) return null;
  const shots = Math.ceil(hp / damage);
  if (shots <= 1) return 0;
  return round(((shots - 1) * 60) / rof, 2);
}

/** Head multiplier from the weapon card text, defaulting to ×1.4. */
export function headMultiplier(rec: { txt?: string[] | null; stats?: Record<string, unknown> | null } | null): number {
  const direct = rec?.stats?.['weapon.tooltip.weapon.info.head_damage_multiplier'];
  if (typeof direct === 'number' && direct > 0) return direct;
  for (const line of rec?.txt ?? []) {
    if (!/голов/i.test(line)) continue;
    const m = line.match(/х\s*([\d.,]+)/i);
    if (m) return parseFloat(m[1].replace(',', '.'));
  }
  return 1.4;
}

/** Picks a per-level stat, falling back to level 0 and then to the nearest lower level. */
export function statAtLevel(stats: WeaponStatLike[], key: string, level: number): number | null {
  const rows = stats.filter((s) => s.key === key && s.value_num != null);
  if (!rows.length) return null;
  const exact = rows.find((s) => s.level === level);
  if (exact) return exact.value_num;
  const lower = rows.filter((s) => s.level < level).sort((a, b) => b.level - a.level)[0];
  if (lower) return lower.value_num;
  return rows.sort((a, b) => a.level - b.level)[0].value_num;
}

export function project15(
  stats: WeaponStatLike[],
  key: string,
  level: number,
): { current: number | null; at15: number | null } {
  return {
    current: statAtLevel(stats, key, level),
    at15: statAtLevel(stats, key, 15),
  };
}
