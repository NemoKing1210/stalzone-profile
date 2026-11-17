import { describe, expect, it } from 'vitest';
import {
  armorAtLevel,
  dps,
  displayDmg,
  displayDps,
  displayTtk,
  headMultiplier,
  ttk,
} from '@profile/core';

describe('precise formulas', () => {
  it('computes DPS and TTK from raw damage', () => {
    expect(dps(56.631096, 500)).toBe(471.9);
    expect(ttk(56.631096, 500)).toBe(1.2);
  });

  it('returns null when damage or rate of fire is missing', () => {
    expect(dps(null, 500)).toBeNull();
    expect(dps(10, 0)).toBeNull();
    expect(ttk(undefined, 500)).toBeNull();
  });
});

describe('display rules', () => {
  it('rounds damage to one decimal before DPS', () => {
    expect(displayDmg(56.631096)).toBe(56.6);
    expect(displayDps(56.631096, 500)).toBe(472);
    expect(displayDps(53.375, 695)).toBe(619);
    expect(displayDps(49.75, 750)).toBe(623);
  });

  it('computes TTK from the displayed damage', () => {
    expect(displayTtk(56.631096, 500)).toBe(1.2);
    expect(displayTtk(10, 600)).toBe(5.9);
    expect(displayTtk(600, 60)).toBe(0);
  });

  it('keeps missing values missing', () => {
    expect(displayDmg(null)).toBeNull();
    expect(displayDps(10, null)).toBeNull();
    expect(displayTtk(null, 600)).toBeNull();
  });
});

describe('armor curve', () => {
  it('reads the level and clamps to the curve ends', () => {
    const curve = [10, 20, 30];
    expect(armorAtLevel(curve, 0)).toBe(10);
    expect(armorAtLevel(curve, 1)).toBe(20);
    expect(armorAtLevel(curve, 15)).toBe(30);
  });

  it('returns null without a curve', () => {
    expect(armorAtLevel(null, 5)).toBeNull();
    expect(armorAtLevel([], 5)).toBeNull();
  });
});

describe('head multiplier', () => {
  it('reads the card text and falls back to 1.4', () => {
    expect(headMultiplier({ txt: ['Урон в голову х2,1'] })).toBe(2.1);
    expect(headMultiplier({ txt: [] })).toBe(1.4);
    expect(headMultiplier(null)).toBe(1.4);
  });
});
