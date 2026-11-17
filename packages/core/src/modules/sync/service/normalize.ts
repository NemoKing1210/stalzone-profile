import { norm, shortHash, slugify } from '@profile/shared';
import type { ItemEffectInput, StatInput } from '../../catalog/index.js';

type Json = Record<string, any>;

export { isCosmeticCategory, kindFromCategory } from '../../catalog/index.js';

const LABEL_PREFIX = 'stalker.artefact_properties.factor.';

export function localExboId(kind: string, name: string): string {
  return `local:${kind}:${shortHash(norm(name), 10)}`;
}

function shortStatKey(key: string): string {
  return key.startsWith(LABEL_PREFIX) ? key.slice(LABEL_PREFIX.length) : key;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function statLabel(labels: Record<string, string>, key: string): string | null {
  return labels[key] ?? labels[key.replace(/^kv:/, '')] ?? null;
}

const WEAPON_CATEGORY: Record<string, string> = {
  Автоматы: 'weapon/assault_rifle',
  Пулемёты: 'weapon/machine_gun',
  'Снайперские винтовки': 'weapon/sniper_rifle',
  Дробовики: 'weapon/shotgun_rifle',
  ПП: 'weapon/submachine_gun',
  Пистолеты: 'weapon/pistol',
  'Ближний бой': 'weapon/melee',
  Тяжёлое: 'weapon/heavy',
  Устройства: 'weapon/device',
  Прочее: 'weapon/other',
};

const ARMOR_CATEGORY: Record<string, string> = {
  боевая: 'armor/combat',
  комбинированная: 'armor/combined',
  научная: 'armor/scientific',
  прочее: 'armor/other',
};

export function weaponCategory(type: string | null | undefined): string {
  return (
    WEAPON_CATEGORY[String(type ?? '')] ?? `weapon/${slugify(String(type ?? 'other')).replace(/-/g, '_') || 'other'}`
  );
}

export function armorCategory(cls: string | null | undefined): string {
  return ARMOR_CATEGORY[String(cls ?? '')] ?? `armor/${slugify(String(cls ?? 'other')) || 'other'}`;
}

export const PROT_TO_KEY: Record<string, string> = {
  bullet: 'bullet_dmg_factor',
  tear: 'tear_dmg_factor',
  explosion: 'explosion_dmg_factor',
  electric: 'electric_dmg_factor',
  fire: 'fire_dmg_factor',
  chem: 'chem_dmg_factor',
  rad: 'rad_dmg_factor',
  temp: 'temp_dmg_factor',
  bio: 'bio_dmg_factor',
  psy: 'psy_dmg_factor',
  bleed: 'bleeding_dmg_factor',
};

export function remoteIcon(rec: Json, realm = 'ru'): string | null {
  if (!rec?.id || !rec?.cat) return null;
  return `https://raw.githubusercontent.com/EXBO-Studio/stalzone-database/main/${realm}/icons/${rec.cat}/${String(
    rec.id,
  ).toLowerCase()}.png`;
}

export function exboStats(rec: Json, labels: Record<string, string>): StatInput[] {
  const out: StatInput[] = [];
  for (const [rawKey, value] of Object.entries<Json>(rec?.st ?? {})) {
    const key = rawKey;
    const label = statLabel(labels, rawKey);
    if (typeof value === 'number') out.push({ key, label, valueNum: value });
    else if (Array.isArray(value)) out.push({ key, label, valueText: JSON.stringify(value) });
    else if (typeof value === 'string') out.push({ key, label, valueText: value });
  }
  return out;
}

export function wikiStats(rec: Json, labels: Record<string, string>): StatInput[] {
  const out: StatInput[] = [];
  const push = (stat: Json, additional: boolean) => {
    const keyRaw = String(stat?.key ?? stat?.name?.key ?? '');
    if (!keyRaw) return;
    const key = shortStatKey(keyRaw);
    const label = stat?.name?.lines?.ru ?? statLabel(labels, keyRaw) ?? null;
    const variants = stat?.numericVariants;
    if (Array.isArray(variants) && variants.length) {
      // The schema allows levels 0..15; a longer source array must not abort the sync.
      variants.slice(0, 16).forEach((value: number, level: number) => {
        out.push({
          key,
          label,
          level,
          valueNum: asNumber(value),
          pct: !!stat.is_percentage,
          positive: stat.is_positive ?? null,
          isAdditional: additional,
        });
      });
      return;
    }
    const value = stat?.value ?? {};
    const min = asNumber(value.min) ?? asNumber(value.calculated);
    const max = asNumber(value.max) ?? asNumber(value.calculated);
    const isRange = stat?.type === 'range' || (min != null && max != null && min !== max);
    out.push({
      key,
      label,
      valueNum: isRange ? null : (value.calculated ?? min ?? max ?? null),
      valueMin: isRange ? min : null,
      valueMax: isRange ? max : null,
      pct: !!stat.is_percentage,
      positive: stat.is_positive ?? null,
      isAdditional: additional,
    });
  };
  for (const stat of rec?.stats ?? []) push(stat, false);
  for (const stat of rec?.additionalStats ?? []) push(stat, true);
  // Containers expose these at the top level, not as `stats` entries; the cards
  // read them as `container.*`.
  const containerFields: [string, string][] = [
    ['capacity', 'container.slots'],
    ['effectiveness', 'container.effectiveness'],
    ['protection', 'container.protection'],
  ];
  for (const [field, key] of containerFields) {
    const value = asNumber(rec?.[field]);
    if (value != null) out.push({ key, label: null, valueNum: value });
  }
  // A stat entry with no value at any level is not data: writing it would create a
  // row the card reads as "no data" and make a wiki-only item look populated.
  return out.filter(
    (stat) => stat.valueNum != null || stat.valueMin != null || stat.valueMax != null || stat.valueText != null,
  );
}

/** Display effect lines: one per named wiki stat, positives first by position. */
export function wikiEffects(rec: Json): ItemEffectInput[] {
  const out: ItemEffectInput[] = [];
  for (const stat of [...(rec?.stats ?? []), ...(rec?.additionalStats ?? [])]) {
    const label = stat?.name?.lines?.ru;
    if (!label) continue;
    out.push({ position: out.length, label, isPositive: stat?.is_positive !== false });
  }
  return out;
}

export function ttkStats(rec: Json): StatInput[] {
  const out: StatInput[] = [];
  const dv = rec?.damageVariants ?? {};
  const variants: [string, string][] = [
    ['startDamageVariants', 'damage.start'],
    ['endDamageVariants', 'damage.end'],
    ['damageDecreaseStartVariants', 'damage.decrease_start'],
    ['damageDecreaseEndVariants', 'damage.decrease_end'],
    ['maxDistanceVariants', 'damage.max_distance'],
  ];
  for (const [field, key] of variants) {
    const arr = dv[field];
    if (!Array.isArray(arr)) continue;
    arr.slice(0, 16).forEach((value: number, level: number) => {
      out.push({ key, level, valueNum: asNumber(value) });
    });
  }
  for (const stat of rec?.stats ?? []) {
    const key = String(stat?.name?.key ?? stat?.key ?? '');
    if (!key) continue;
    const value = stat?.value;
    if (typeof value === 'number') out.push({ key, label: stat?.name?.lines?.ru ?? null, valueNum: value });
    else if (value && typeof value === 'object') {
      const v = asNumber(value.calculated) ?? asNumber(value.min);
      if (v != null) out.push({ key, label: stat?.name?.lines?.ru ?? null, valueNum: v });
    }
  }
  if (asNumber(rec?.clipSize) != null) {
    out.push({ key: 'weapon.tooltip.weapon.info.clip_size', label: 'Объем магазина', valueNum: rec.clipSize });
  }
  if (rec?.ammoType?.value?.lines?.ru) {
    out.push({
      key: 'kv:weapon.tooltip.weapon.info.ammo_type',
      label: 'Тип боеприпасов',
      valueText: rec.ammoType.value.lines.ru,
    });
  }
  if (asNumber(rec?.maxDistance) != null) {
    out.push({
      key: 'weapon.tooltip.weapon.info.distance',
      label: 'Максимальная дистанция',
      valueNum: rec.maxDistance,
    });
  }
  return out;
}
