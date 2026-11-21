/**
 * The DPS/TTK math lives in `@profile/shared/calc` so the browser and the server run the
 * same functions; this module re-exports it as the server's one formula and keeps the
 * card-level stat helpers that only the catalog needs.
 */
export { DUMMY_HP, dps, displayDmg, displayDps, displayTtk, ttk } from '@profile/shared/calc';

export interface WeaponStatLike {
  key: string;
  level: number;
  value_num: number | null;
}

/** Head multiplier from the weapon card text, defaulting to ×1.4. */
export function headMultiplier(rec: { txt?: string[] | null; stats?: Record<string, unknown> | null } | null): number {
  const direct = rec?.stats?.['weapon.tooltip.weapon.info.head_damage_multiplier'];
  if (typeof direct === 'number' && direct > 0) return direct;
  for (const line of rec?.txt ?? []) {
    if (!/голов/i.test(line)) continue;
    const m = line.match(/х\s*([\d.,]+)/i);
    const group = m?.[1];
    if (group) return parseFloat(group.replace(',', '.'));
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
  const first = rows.sort((a, b) => a.level - b.level)[0];
  return first?.value_num ?? null;
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
