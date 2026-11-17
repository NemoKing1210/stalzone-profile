import { round } from '@profile/shared';
import type { ArtifactStat } from './artifacts.js';

export const BASE_CARRY_WEIGHT = 50;
export const SAFE_LIMIT_RATIO = 0.75;

/** A single number sets `value` and both bounds; a range leaves `value` null. */
export interface RangeValue {
  min: number | null;
  max: number | null;
  value: number | null;
  missing: string[];
}

export interface ArtifactLoadoutInput {
  itemId: number;
  name: string;
  level: number;
  rarityPct: number | null;
  rarityTier: string | null;
  stats: ArtifactStat[];
}

export interface ContainerLoadoutInput {
  itemId: number;
  effectiveness: number | null;
  protection: number | null;
  slots?: number | null;
  artifacts: ArtifactLoadoutInput[];
}

export interface LoadoutInput {
  baseCarryWeight?: number;
  armor: { itemId: number; maxWeightBonus: number | null; protection: Record<string, number | null> }[];
  containers: ContainerLoadoutInput[];
  carriedWeights: (number | null)[];
  storageWeights: { storageId: number; weights: (number | null)[]; ids?: number[] }[];
  /** Item ids aligned with `carriedWeights`, used for the `missing` labels. */
  allItemIds: string[];
}

export interface EffectBreakdown {
  positive: RangeValue;
  negative: RangeValue;
  purge: RangeValue | null;
}

export interface ContainerLoadout {
  itemId: number;
  effectiveness: number | null;
  slots: number | null;
  innerProtection: Record<'rad' | 'temp' | 'bio' | 'psy' | 'frost', number | null>;
  effects: Record<string, EffectBreakdown>;
}

export interface LoadoutStats {
  carry: {
    base: number;
    bonus: RangeValue;
    total: RangeValue;
    safeLimit: RangeValue;
    carried: RangeValue;
    aboveSafe: boolean | null;
    overweight: boolean | null;
  };
  storages: Record<number, RangeValue>;
  protection: Record<string, RangeValue | null>;
  effects: Record<string, EffectBreakdown>;
  containers: ContainerLoadout[];
  warnings: string[];
}

const HAZARD_KEYS: Record<string, 'rad' | 'temp' | 'bio' | 'psy' | 'frost'> = {
  radiation: 'rad',
  rad: 'rad',
  radiation_protection: 'rad',
  rad_dmg_factor: 'rad',
  temperature: 'temp',
  temp: 'temp',
  thermal_protection: 'temp',
  temp_dmg_factor: 'temp',
  bioinfection: 'bio',
  bio: 'bio',
  biological_protection: 'bio',
  bio_dmg_factor: 'bio',
  psy: 'psy',
  psy_emissions: 'psy',
  psycho_protection: 'psy',
  psy_dmg_factor: 'psy',
  frost: 'frost',
  frost_protection: 'frost',
  frost_dmg_factor: 'frost',
};

const TIER_ORDER = ['ordinary', 'unordinary', 'special', 'rare', 'exclusive', 'legendary', 'unique'] as const;

const TIER_BOUNDARIES = [
  { roll: 100, lower: 'ordinary', upper: 'unordinary' },
  { roll: 115, lower: 'unordinary', upper: 'special' },
  { roll: 130, lower: 'special', upper: 'rare' },
  { roll: 145, lower: 'rare', upper: 'exclusive' },
  { roll: 160, lower: 'exclusive', upper: 'legendary' },
  { roll: 175, lower: 'legendary', upper: 'unique' },
] as const;

function rangeValue(min: number, max: number, missing: string[] = []): RangeValue {
  const lo = round(min, 2);
  const hi = round(max, 2);
  return { min: lo, max: hi, value: lo === hi ? lo : null, missing };
}

function nullRange(missing: string[] = []): RangeValue {
  return { min: null, max: null, value: null, missing };
}

function addRange(target: { min: number; max: number }, min: number, max: number): boolean {
  target.min += min;
  target.max += max;
  return min !== max;
}

function floorSafe(value: number): number {
  return Math.floor(value * SAFE_LIMIT_RATIO * 10) / 10;
}

export function scaleBeneficial(
  base: number,
  rarityPct: number | null,
  level: number,
  effectiveness: number | null,
): number | null {
  if (rarityPct == null || effectiveness == null) return null;
  return round(base * (rarityPct / 100) * (1 + 0.3 * (level / 15)) * (effectiveness / 100), 2);
}

/**
 * Downsides move linearly to the top of the range by 100%, then interpolate
 * inside the public tiers. At an exact boundary the tier label chooses the
 * endpoint; without a matching tier the function returns the full range.
 */
export function scaleDownside(
  min: number,
  max: number,
  rarityPct: number | null,
  tier: string | null,
): { min: number; max: number } | null {
  if (rarityPct == null) return null;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const roll = Math.max(0, Math.min(175, rarityPct));

  const boundary = TIER_BOUNDARIES.find((entry) => entry.roll === roll);
  if (boundary) {
    const index = TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number]);
    const lowerIndex = TIER_ORDER.indexOf(boundary.lower);
    const upperIndex = TIER_ORDER.indexOf(boundary.upper);
    if (index === lowerIndex) return { min: max, max };
    if (index === upperIndex) return { min, max: min };
    return { min, max };
  }

  if (roll <= 100) {
    const value = min + (max - min) * (roll / 100);
    return { min: round(value, 2), max: round(value, 2) };
  }

  const tiers = [
    { start: 101, end: 115 },
    { start: 116, end: 130 },
    { start: 131, end: 145 },
    { start: 146, end: 160 },
    { start: 161, end: 175 },
  ];
  const tierRange = tiers.find((entry) => roll >= entry.start && roll <= entry.end);
  if (!tierRange) return { min, max };
  const t = (roll - tierRange.start) / (tierRange.end - tierRange.start);
  const value = min + (max - min) * t;
  return { min: round(value, 2), max: round(value, 2) };
}

/** The protection applies to the positive combined net of one container only. */
export function applyInnerProtection(net: number, protection: number | null): number | null {
  if (net <= 0) return net;
  if (protection == null) return null;
  const pct = Math.max(0, Math.min(100, protection));
  return round(net * (1 - pct / 100), 2);
}

function sumWeights(weights: readonly (number | null)[], labels: readonly string[]): RangeValue {
  const missing: string[] = [];
  let sum = 0;
  weights.forEach((weight, index) => {
    if (weight == null) missing.push(labels[index] ?? String(index + 1));
    else sum += weight;
  });
  if (missing.length) return nullRange(missing);
  return rangeValue(sum, sum);
}

function addToCarry(
  totals: { min: number; max: number },
  min: number | null,
  max: number | null,
  missing: string[],
  label: string,
): boolean {
  if (min == null || max == null) {
    missing.push(label);
    return false;
  }
  return addRange(totals, min, max);
}

interface Accum {
  min: number;
  max: number;
  any: boolean;
  ranged: boolean;
}

function emptyAccum(): Accum {
  return { min: 0, max: 0, any: false, ranged: false };
}

function addAccum(acc: Accum, min: number, max: number): void {
  acc.any = true;
  acc.min += min;
  acc.max += max;
  if (min !== max) acc.ranged = true;
}

function accumRange(acc: Accum, missing: string[]): RangeValue {
  if (acc.any) return rangeValue(acc.min, acc.max, missing);
  return missing.length ? nullRange(missing) : rangeValue(0, 0, []);
}

function artifactScale(
  stat: ArtifactStat,
  artifact: ArtifactLoadoutInput,
  effectiveness: number | null,
  mode: 'effect' | 'purge',
): { min: number; max: number } | null {
  const eff = mode === 'purge' ? 100 : effectiveness;
  const min = scaleBeneficial(stat.min, artifact.rarityPct, artifact.level, eff);
  const max = scaleBeneficial(stat.max, artifact.rarityPct, artifact.level, eff);
  if (min == null || max == null) return null;
  return { min, max };
}

export function computeLoadout(input: LoadoutInput): LoadoutStats {
  const base = input.baseCarryWeight ?? BASE_CARRY_WEIGHT;
  const warnings = new Set<string>();
  const missingBonus: string[] = [];
  const bonus = { min: 0, max: 0 };
  let bonusRanged = false;

  for (const armor of input.armor) {
    const value = armor.maxWeightBonus ?? 0;
    addRange(bonus, value, value);
  }

  type Totals = {
    positive: Accum;
    negative: Accum;
    purge: Accum;
    hasPurge: boolean;
    missingPositive: Set<string>;
    missingNegative: Set<string>;
    missingPurge: Set<string>;
  };

  const containerEffects: ContainerLoadout[] = [];
  const effectTotals = new Map<string, Totals>();

  for (const container of input.containers) {
    const buckets = new Map<
      string,
      {
        positive: Accum;
        negative: Accum;
        purge: Accum;
        hasPurge: boolean;
        missingPositive: Set<string>;
        missingNegative: Set<string>;
        missingPurge: Set<string>;
      }
    >();

    for (const artifact of container.artifacts) {
      for (const stat of artifact.stats) {
        const bucket =
          buckets.get(stat.key) ??
          {
            positive: emptyAccum(),
            negative: emptyAccum(),
            purge: emptyAccum(),
            hasPurge: false,
            missingPositive: new Set<string>(),
            missingNegative: new Set<string>(),
            missingPurge: new Set<string>(),
          };
        buckets.set(stat.key, bucket);

        if (stat.pos) {
          const purge = HAZARD_KEYS[stat.key] != null;
          const scaled = artifactScale(stat, artifact, container.effectiveness, purge ? 'purge' : 'effect');
          if (!scaled) {
            (purge ? bucket.missingPurge : bucket.missingPositive).add(String(artifact.itemId));
            if (artifact.rarityPct == null) warnings.add(`missing:rarity:${artifact.itemId}`);
            if (!purge && container.effectiveness == null) warnings.add(`missing:effectiveness:${container.itemId}`);
            continue;
          }
          if (purge) {
            addAccum(bucket.purge, scaled.min, scaled.max);
            bucket.hasPurge = true;
          } else {
            addAccum(bucket.positive, scaled.min, scaled.max);
          }
        } else {
          const scaled = scaleDownside(stat.min, stat.max, artifact.rarityPct, artifact.rarityTier);
          if (!scaled) {
            bucket.missingNegative.add(String(artifact.itemId));
            if (artifact.rarityPct == null) warnings.add(`missing:rarity:${artifact.itemId}`);
            continue;
          }
          addAccum(bucket.negative, scaled.min, scaled.max);
        }
      }
    }

    const effects: Record<string, EffectBreakdown> = {};
    for (const [key, bucket] of buckets) {
      const missingPositive = [...bucket.missingPositive];
      const missingNegative = [...bucket.missingNegative];
      const missingPurge = [...bucket.missingPurge];
      let purge: RangeValue | null = null;
      if (bucket.hasPurge && missingNegative.length) {
        purge = nullRange(missingNegative);
      } else if (bucket.hasPurge) {
        const netMin = bucket.purge.min - bucket.negative.min;
        const netMax = bucket.purge.max - bucket.negative.max;
        const finalMin = applyInnerProtection(netMin, container.protection);
        const finalMax = applyInnerProtection(netMax, container.protection);
        if (finalMin == null || finalMax == null) {
          purge = nullRange(missingPurge);
          if (container.artifacts.length && container.protection == null) {
            warnings.add(`missing:innerProtection:${container.itemId}`);
          }
        } else {
          purge = rangeValue(finalMin, finalMax, missingPurge);
        }
      } else if (missingPurge.length) {
        purge = nullRange(missingPurge);
      }
      effects[key] = {
        positive: accumRange(bucket.positive, missingPositive),
        negative: accumRange(bucket.negative, missingNegative),
        purge,
      };

      const total =
        effectTotals.get(key) ??
        {
          positive: emptyAccum(),
          negative: emptyAccum(),
          purge: emptyAccum(),
          hasPurge: false,
          missingPositive: new Set<string>(),
          missingNegative: new Set<string>(),
          missingPurge: new Set<string>(),
        };
      effectTotals.set(key, total);
      if (bucket.positive.any) addAccum(total.positive, bucket.positive.min, bucket.positive.max);
      if (bucket.negative.any) addAccum(total.negative, bucket.negative.min, bucket.negative.max);
      for (const id of missingPositive) total.missingPositive.add(id);
      for (const id of missingNegative) total.missingNegative.add(id);
      for (const id of missingPurge) total.missingPurge.add(id);
      if (purge?.value != null || (purge && purge.min != null && purge.max != null)) {
        addAccum(total.purge, purge.min!, purge.max!);
        total.hasPurge = true;
      } else if (purge === null && (missingPurge.length || missingNegative.length)) {
        total.hasPurge = true;
        for (const id of [...missingPurge, ...missingNegative]) total.missingPurge.add(id);
      }
    }

    const protection = container.protection;
    containerEffects.push({
      itemId: container.itemId,
      effectiveness: container.effectiveness,
      slots: container.slots ?? null,
      innerProtection: {
        rad: protection,
        temp: protection,
        bio: protection,
        psy: protection,
        frost: protection == null ? null : 0,
      },
      effects,
    });

    for (const artifact of container.artifacts) {
      const carryStat = artifact.stats.find((stat) => stat.key === 'max_weight_bonus' && stat.pos);
      if (!carryStat) continue;
      const scaled = artifactScale(carryStat, artifact, container.effectiveness, 'effect');
      if (!scaled) {
        missingBonus.push(String(artifact.itemId));
        continue;
      }
      if (addToCarry(bonus, scaled.min, scaled.max, missingBonus, String(artifact.itemId))) bonusRanged = true;
    }
  }

  const bonusRange = missingBonus.length
    ? nullRange([...new Set(missingBonus)])
    : bonusRanged
      ? rangeValue(bonus.min, bonus.max)
      : rangeValue(bonus.min, bonus.max);

  const carryTotal = bonusRange.min == null || bonusRange.max == null
    ? nullRange(bonusRange.missing)
    : rangeValue(base + bonusRange.min, base + bonusRange.max, bonusRange.missing);
  const safeLimit =
    carryTotal.min == null || carryTotal.max == null
      ? nullRange(carryTotal.missing)
      : rangeValue(floorSafe(carryTotal.min), floorSafe(carryTotal.max), carryTotal.missing);

  const carried = sumWeights(input.carriedWeights, input.allItemIds);
  if (carried.value == null && carried.missing.length) {
    for (const id of carried.missing) warnings.add(`missing:weight:${id}`);
  }

  const storages: Record<number, RangeValue> = {};
  for (const storage of input.storageWeights) {
    const range = sumWeights(storage.weights, (storage.ids ?? []).map(String));
    storages[storage.storageId] = range;
    if (range.value == null && range.missing.length) {
      for (const id of range.missing) warnings.add(`missing:storageWeight:${storage.storageId}:${id}`);
    }
  }

  const protection: Record<string, RangeValue | null> = {};
  const protectionKeys = new Set(input.armor.flatMap((armor) => Object.keys(armor.protection)));
  for (const key of protectionKeys) {
    // Only armor that declares this protection type contributes to it. An entry that
    // carries no such key (a backpack, say) is silent on it, not a missing value.
    const values = input.armor
      .filter((armor) => key in armor.protection)
      .map((armor) => armor.protection[key] ?? null);
    if (values.some((value) => value == null)) {
      protection[key] = null;
      continue;
    }
    const sum = values.reduce<number>((acc, value) => acc + (value ?? 0), 0);
    protection[key] = rangeValue(sum, sum);
  }

  const effects: Record<string, EffectBreakdown> = {};
  for (const [key, total] of effectTotals) {
    effects[key] = {
      positive: accumRange(total.positive, [...total.missingPositive]),
      negative: accumRange(total.negative, [...total.missingNegative]),
      purge: total.hasPurge ? accumRange(total.purge, [...total.missingPurge]) : null,
    };
  }

  const aboveSafe =
    carried.max != null && safeLimit.min != null ? carried.max > safeLimit.min : null;
  const overweight =
    carried.max != null && carryTotal.min != null ? carried.max > carryTotal.min : null;

  return {
    carry: {
      base,
      bonus: bonusRange,
      total: carryTotal,
      safeLimit,
      carried,
      aboveSafe,
      overweight,
    },
    storages,
    protection,
    effects,
    containers: containerEffects,
    warnings: [...warnings].sort(),
  };
}
