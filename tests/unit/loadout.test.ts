import { describe, expect, it } from 'vitest';
import { applyInnerProtection, computeLoadout, scaleBeneficial, scaleDownside } from '@profile/core/modules/catalog';
import type { ArtifactStat, LoadoutInput } from '@profile/core/modules/catalog';

function stat(overrides: Partial<ArtifactStat> = {}): ArtifactStat {
  return {
    key: 'speed_modifier',
    label: 'Speed',
    min: 5,
    max: 5,
    mid: 5,
    pos: true,
    pct: true,
    ...overrides,
  };
}

function input(overrides: Partial<LoadoutInput> = {}): LoadoutInput {
  return {
    baseCarryWeight: 50,
    armor: [],
    containers: [],
    carriedWeights: [],
    storageWeights: [],
    allItemIds: [],
    ...overrides,
  };
}

describe('loadout formulas', () => {
  it('scales a beneficial artifact stat by rarity, level and effectiveness', () => {
    expect(scaleBeneficial(10, 150, 15, 115)).toBeCloseTo(22.4, 1);
    expect(scaleBeneficial(10, null, 15, 115)).toBeNull();
    expect(scaleBeneficial(10, 150, 15, null)).toBeNull();
  });

  it('floors the safe limit to one decimal', () => {
    const stats = computeLoadout(input({ baseCarryWeight: 101 }));
    expect(stats.carry.total.value).toBe(101);
    expect(stats.carry.safeLimit.value).toBe(75.7);
  });

  it('applies inner protection to the net total and never to frost', () => {
    expect(applyInnerProtection(4, 50)).toBe(2);
    expect(applyInnerProtection(4, 0)).toBe(4);
    expect(applyInnerProtection(-4, 50)).toBe(-4);
    expect(applyInnerProtection(4, null)).toBeNull();
  });

  it('does not scale a downside by level or effectiveness and shows a range for an unknown boundary tier', () => {
    expect(scaleDownside(1, 2, 100, 'rare')).toEqual({ min: 1, max: 2 });
    expect(scaleDownside(1, 2, 100, 'ordinary')).toEqual({ min: 2, max: 2 });
    expect(scaleDownside(1, 2, 100, 'unordinary')).toEqual({ min: 1, max: 1 });
  });

  it('keeps a range when the artifact base is a range', () => {
    const stats = computeLoadout(
      input({
        containers: [
          {
            itemId: 2,
            effectiveness: 100,
            protection: 0,
            artifacts: [
              {
                itemId: 3,
                name: 'Artifact',
                level: 0,
                rarityPct: 100,
                rarityTier: null,
                stats: [stat({ min: 0.5, max: 1, mid: 0.75 })],
              },
            ],
          },
        ],
      }),
    );
    expect(stats.effects.speed_modifier?.positive).toEqual({ min: 0.5, max: 1, value: null, missing: [] });
  });

  it('adds protection only from entries that carry that protection type', () => {
    const stats = computeLoadout(
      input({
        armor: [
          { itemId: 1, maxWeightBonus: 10, protection: { bullet: 40, rad: 12 } },
          { itemId: 2, maxWeightBonus: 25, protection: {} },
        ],
      }),
    );
    expect(stats.protection.bullet?.value).toBe(40);
    expect(stats.protection.rad?.value).toBe(12);
  });

  it('treats a missing optional bonus as no bonus but a missing weight as unknown', () => {
    const stats = computeLoadout(
      input({
        armor: [{ itemId: 1, maxWeightBonus: null, protection: {} }],
        carriedWeights: [null],
        allItemIds: ['1'],
      }),
    );
    expect(stats.carry.bonus.value).toBe(0);
    expect(stats.carry.carried.value).toBeNull();
    expect(stats.carry.carried.missing).toContain('1');
  });

  it('uses the worst case for the over-safe and overweight flags', () => {
    const stats = computeLoadout(input({ baseCarryWeight: 101, carriedWeights: [80] }));
    expect(stats.carry.aboveSafe).toBe(true);
    expect(stats.carry.overweight).toBe(false);
  });

  it('applies a container protection to its own combined hazard net', () => {
    const stats = computeLoadout(
      input({
        containers: [
          {
            itemId: 2,
            effectiveness: 100,
            protection: 50,
            artifacts: [
              {
                itemId: 3,
                name: 'Radiation',
                level: 0,
                rarityPct: 100,
                rarityTier: null,
                stats: [stat({ key: 'radiation_protection', label: 'Radiation', min: 4, max: 4, mid: 4 })],
              },
            ],
          },
        ],
      }),
    );
    expect(stats.containers[0]?.innerProtection.rad).toBe(50);
    expect(stats.effects.radiation_protection?.purge).toMatchObject({ value: 2 });
  });
});
