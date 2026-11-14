import { round } from '@dossier/shared';

export const ARMOR_MIN = 0;
export const ARMOR_MAX = 15;

/** Maps wiki/EXBO protection stat keys to the short keys used by the page. */
export const ARMOR_PROT_KEYS: Record<string, string> = {
  bullet_dmg_factor: 'bullet',
  tear_dmg_factor: 'tear',
  explosion_dmg_factor: 'explosion',
  electra_dmg_factor: 'electric',
  electric_dmg_factor: 'electric',
  burn_dmg_factor: 'fire',
  fire_dmg_factor: 'fire',
  chemical_burn_dmg_factor: 'chem',
  chem_dmg_factor: 'chem',
  radiation_protection: 'rad',
  rad_dmg_factor: 'rad',
  thermal_protection: 'temp',
  temp_dmg_factor: 'temp',
  biological_protection: 'bio',
  bio_dmg_factor: 'bio',
  psycho_protection: 'psy',
  psy_dmg_factor: 'psy',
  bleeding_protection: 'bleed',
  bleeding_dmg_factor: 'bleed',
};

export function protKeyFor(statKey: string): string | null {
  return ARMOR_PROT_KEYS[statKey] ?? null;
}

/** Bullet resistance by upgrade level from `numericVariants` (index = level). */
export function armorAtLevel(curve: number[] | null | undefined, level: number): number | null {
  if (!curve?.length) return null;
  const index = Math.max(ARMOR_MIN, Math.min(ARMOR_MAX, Math.trunc(level)));
  const value = curve[Math.min(index, curve.length - 1)];
  return typeof value === 'number' ? round(value, 1) : null;
}

export function armorProjection(curve: number[] | null | undefined, level: number): { current: number | null; at15: number | null } {
  return { current: armorAtLevel(curve, level), at15: armorAtLevel(curve, 15) };
}

const PROT_SHORT: [string, string][] = [
  ['bullet', 'Пул'],
  ['tear', 'Разр'],
  ['explosion', 'Взр'],
  ['electric', 'Эл'],
  ['fire', 'Ог'],
  ['chem', 'Хим'],
  ['rad', 'Рад'],
  ['temp', 'Тмп'],
  ['bio', 'Био'],
  ['psy', 'Пси'],
  ['bleed', 'Кровь'],
  ['stop', 'Стойк'],
];

export function protShort(prot: Record<string, number | null | undefined> | null | undefined): string {
  if (!prot) return '—';
  const parts = PROT_SHORT.filter(([key]) => prot[key] != null).map(([key, label]) => `${label} ${prot[key]}`);
  return parts.join(' · ') || '—';
}

export function modsShort(mods: { name: string; value: number; pct?: boolean }[] | null | undefined): string {
  return (
    (mods ?? [])
      .map((m) => `${m.value > 0 ? '+' : ''}${m.value}${m.pct ? '%' : ''} ${m.name}`)
      .join(' · ') || '—'
  );
}
