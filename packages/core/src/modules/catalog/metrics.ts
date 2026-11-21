import { round } from '@profile/shared';
import type { CatalogMetricKey } from '@profile/shared';
import { displayDps, displayTtk } from './calc/weapons.js';
import { armorAtLevel } from './calc/armor.js';
import { armorCurve, itemText, itemValue, itemValueExact } from './service/catalog-view.js';
import type { ItemRow, ItemStatRow } from './repo/items.js';

export type MetricDirection = 'higher' | 'lower';

/** Kinds whose rows carry metrics; motifs and ammo stay out of the comparator. */
export type CatalogMetricKind = 'weapon' | 'armor' | 'container' | 'artifact' | 'modification';

export interface MetricContext {
  item: ItemRow;
  rows: ItemStatRow[];
  level: number;
  hp: number;
}

export interface MetricDefinition {
  key: CatalogMetricKey;
  label: string;
  unit: string | null;
  direction: MetricDirection;
  kinds: CatalogMetricKind[];
  leveled: boolean;
  read(ctx: MetricContext): number | string | null;
}

const WEAPON: CatalogMetricKind[] = ['weapon'];
const ARMOR: CatalogMetricKind[] = ['armor'];
const CONTAINER: CatalogMetricKind[] = ['container'];

function weaponDamage(ctx: MetricContext): number | null {
  return itemValueExact(ctx.rows, 'damage.start', ctx.level);
}

function weaponRof(ctx: MetricContext): number | null {
  return itemValue(ctx.rows, 'weapon.tooltip.weapon.info.rate_of_fire', ctx.level);
}

/**
 * The one metric vocabulary. `read` returns `null` when the source has no value at the
 * requested level; a missing number never becomes zero. `caliber` is text, so its
 * direction is nominal and the comparator skips it.
 */
export const CATALOG_METRICS: readonly MetricDefinition[] = [
  { key: 'damage', label: 'Damage', unit: 'hp', direction: 'higher', kinds: WEAPON, leveled: true, read: weaponDamage },
  {
    key: 'dps',
    label: 'DPS',
    unit: null,
    direction: 'higher',
    kinds: WEAPON,
    leveled: true,
    read: (ctx) => displayDps(weaponDamage(ctx), weaponRof(ctx)),
  },
  {
    key: 'ttk',
    label: 'TTK',
    unit: 's',
    direction: 'lower',
    kinds: WEAPON,
    leveled: true,
    read: (ctx) => displayTtk(weaponDamage(ctx), weaponRof(ctx), ctx.hp),
  },
  { key: 'rof', label: 'Rate of fire', unit: 'rpm', direction: 'higher', kinds: WEAPON, leveled: true, read: weaponRof },
  {
    key: 'recoil',
    label: 'Recoil',
    unit: null,
    direction: 'lower',
    kinds: WEAPON,
    leveled: true,
    read: (ctx) => itemValue(ctx.rows, 'weapon.tooltip.weapon.info.recoil', ctx.level),
  },
  {
    key: 'spread',
    label: 'Spread',
    unit: null,
    direction: 'lower',
    kinds: WEAPON,
    leveled: true,
    read: (ctx) => itemValue(ctx.rows, 'weapon.tooltip.weapon.info.spread', ctx.level),
  },
  {
    key: 'hipSpread',
    label: 'Hip spread',
    unit: null,
    direction: 'lower',
    kinds: WEAPON,
    leveled: true,
    read: (ctx) => itemValue(ctx.rows, 'weapon.tooltip.weapon.info.hip_spread', ctx.level),
  },
  {
    key: 'mag',
    label: 'Magazine',
    unit: 'rounds',
    direction: 'higher',
    kinds: WEAPON,
    leveled: true,
    read: (ctx) => itemValue(ctx.rows, 'weapon.tooltip.weapon.info.clip_size', ctx.level),
  },
  {
    key: 'reload',
    label: 'Reload',
    unit: 's',
    direction: 'lower',
    kinds: WEAPON,
    leveled: true,
    read: (ctx) => itemValue(ctx.rows, 'weapon.tooltip.magazine.info.reload_time', ctx.level),
  },
  {
    key: 'reloadTactical',
    label: 'Tactical reload',
    unit: 's',
    direction: 'lower',
    kinds: WEAPON,
    leveled: true,
    read: (ctx) => itemValue(ctx.rows, 'weapon.tooltip.magazine.info.reload_time_tactical', ctx.level),
  },
  {
    key: 'ergonomics',
    label: 'Ergonomics',
    unit: null,
    direction: 'higher',
    kinds: WEAPON,
    leveled: true,
    read: (ctx) => itemValue(ctx.rows, 'weapon.stat_factor.reload_modifier', ctx.level),
  },
  {
    key: 'draw',
    label: 'Draw time',
    unit: 's',
    direction: 'lower',
    kinds: WEAPON,
    leveled: true,
    read: (ctx) => itemValue(ctx.rows, 'weapon.tooltip.weapon.info.draw_time', ctx.level),
  },
  {
    key: 'aim',
    label: 'Aim time',
    unit: 's',
    direction: 'lower',
    kinds: WEAPON,
    leveled: true,
    read: (ctx) => itemValue(ctx.rows, 'weapon.tooltip.weapon.info.aim_switch', ctx.level),
  },
  {
    key: 'pierce',
    label: 'Piercing',
    unit: null,
    direction: 'higher',
    kinds: WEAPON,
    leveled: true,
    read: (ctx) => itemValue(ctx.rows, 'weapon.tooltip.weapon.info.piercing', ctx.level),
  },
  {
    key: 'platePen',
    label: 'Plate penetration',
    unit: null,
    direction: 'higher',
    kinds: WEAPON,
    leveled: true,
    read: (ctx) => itemValue(ctx.rows, 'weapon.tooltip.weapon.info.plate_penetrating', ctx.level),
  },
  {
    key: 'caliber',
    label: 'Caliber',
    unit: null,
    direction: 'higher',
    kinds: WEAPON,
    leveled: false,
    read: (ctx) => itemText(ctx.rows, 'kv:weapon.tooltip.weapon.info.ammo_type'),
  },
  {
    key: 'armor',
    label: 'Armor',
    unit: null,
    direction: 'higher',
    kinds: ARMOR,
    leveled: true,
    read: (ctx) => armorAtLevel(armorCurve(ctx.rows), ctx.level),
  },
  {
    key: 'protectionBullet',
    label: 'Bullet protection',
    unit: null,
    direction: 'higher',
    kinds: ARMOR,
    leveled: true,
    read: (ctx) => armorAtLevel(armorCurve(ctx.rows), ctx.level),
  },
  {
    key: 'slots',
    label: 'Slots',
    unit: null,
    direction: 'higher',
    kinds: CONTAINER,
    leveled: false,
    read: (ctx) => itemValue(ctx.rows, 'container.slots', ctx.level),
  },
  {
    key: 'effectiveness',
    label: 'Effectiveness',
    unit: '%',
    direction: 'higher',
    kinds: CONTAINER,
    leveled: false,
    read: (ctx) => itemValue(ctx.rows, 'container.effectiveness', ctx.level),
  },
  {
    key: 'slotEquivalent',
    label: 'Slot equivalent',
    unit: null,
    direction: 'higher',
    kinds: CONTAINER,
    leveled: false,
    read: (ctx) => {
      const slots = itemValue(ctx.rows, 'container.slots', ctx.level);
      const eff = itemValue(ctx.rows, 'container.effectiveness', ctx.level);
      return slots != null && eff != null ? round((slots * eff) / 100, 2) : null;
    },
  },
  {
    key: 'protection',
    label: 'Protection',
    unit: null,
    direction: 'higher',
    kinds: CONTAINER,
    leveled: false,
    read: (ctx) => itemValue(ctx.rows, 'container.protection', ctx.level),
  },
  {
    key: 'weight',
    label: 'Weight',
    unit: 'kg',
    direction: 'lower',
    kinds: ['weapon', 'armor', 'container', 'artifact', 'modification'],
    leveled: false,
    read: (ctx) => ctx.item.weight ?? null,
  },
];

const BY_KEY = new Map<string, MetricDefinition>(CATALOG_METRICS.map((metric) => [metric.key, metric]));

export function metricByKey(key: string): MetricDefinition | undefined {
  return BY_KEY.get(key);
}

export function metricKeysForKind(kind: string): string[] {
  return CATALOG_METRICS.filter((metric) => metric.kinds.includes(kind as CatalogMetricKind)).map(
    (metric) => metric.key,
  );
}

/** Every metric the item's kind defines; unsupported and missing values stay `null`. */
export function metricRow(ctx: MetricContext): Record<string, number | string | null> {
  const kind = ctx.item.kind as CatalogMetricKind;
  const out: Record<string, number | string | null> = {};
  for (const metric of CATALOG_METRICS) {
    if (!metric.kinds.includes(kind)) continue;
    out[metric.key] = metric.read(ctx);
  }
  return out;
}

export function metricValue(ctx: MetricContext, key: string): number | string | null {
  const metric = BY_KEY.get(key);
  if (!metric || !metric.kinds.includes(ctx.item.kind as CatalogMetricKind)) return null;
  return metric.read(ctx);
}
