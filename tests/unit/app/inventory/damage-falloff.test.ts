import type { DamagePoint } from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';

import { damageAtDistance, damageFalloff, falloffPoints } from '~/features/inventory/model/damageFalloff';

function point(overrides: Partial<DamagePoint> = {}): DamagePoint {
  return { d0: 40, dB: 20, distA: 10, distB: 30, distMax: 50, ...overrides };
}

describe('damageFalloff', () => {
  it('builds both series on one shared scale', () => {
    const data = damageFalloff({
      p0: point(),
      p15: point({ d0: 60, dB: 30, distMax: 70 }),
    });

    expect(data).not.toBeNull();
    expect(data!.series.map((series) => series.level)).toEqual([0, 15]);
    expect(data!.series[0]!.points).toEqual([
      { distance: 0, damage: 40 },
      { distance: 10, damage: 40 },
      { distance: 30, damage: 20 },
      { distance: 50, damage: 20 },
    ]);
    expect(data!.maxDistance).toBe(70);
    expect(data!.maxDamage).toBe(60);
  });

  it('keeps one valid series when the other is missing', () => {
    const data = damageFalloff({ p0: point(), p15: null });
    expect(data?.series.map((series) => series.level)).toEqual([0]);
  });

  it('skips a series with a missing dB, distA or distMax', () => {
    for (const key of ['dB', 'distA', 'distMax'] as const) {
      const data = damageFalloff({ p0: point({ [key]: null }), p15: point({ d0: 60, dB: 30 }) });
      expect(data?.series.map((series) => series.level)).toEqual([15]);
    }
  });

  it('rejects unordered distances and a zero span', () => {
    expect(damageFalloff({ p0: point({ distA: 20, distB: 10 }) })).toBeNull();
    expect(damageFalloff({ p0: point({ distB: 60, distMax: 50 }) })).toBeNull();
    expect(damageFalloff({ p0: point({ distMax: 0 }) })).toBeNull();
  });

  it('collapses the duplicate point when distA is zero', () => {
    const data = damageFalloff({ p0: point({ distA: 0 }) });
    expect(data!.series[0]!.points).toEqual([
      { distance: 0, damage: 40 },
      { distance: 30, damage: 20 },
      { distance: 50, damage: 20 },
    ]);
  });

  it('accepts zero damage', () => {
    const data = damageFalloff({ p0: point({ d0: 0, dB: 0 }) });
    expect(data).not.toBeNull();
    expect(data!.maxDamage).toBe(0);
  });

  it('returns null when no series is valid', () => {
    expect(damageFalloff(null)).toBeNull();
    expect(damageFalloff({})).toBeNull();
    expect(damageFalloff({ p0: null, p15: null })).toBeNull();
  });
});

describe('falloffPoints', () => {
  it('returns the same flat–linear–flat path as the card', () => {
    expect(falloffPoints(point())).toEqual([
      { distance: 0, damage: 40 },
      { distance: 10, damage: 40 },
      { distance: 30, damage: 20 },
      { distance: 50, damage: 20 },
    ]);
    expect(falloffPoints(null)).toBeNull();
  });
});

describe('damageAtDistance', () => {
  const points = [
    { distance: 0, damage: 40 },
    { distance: 10, damage: 40 },
    { distance: 30, damage: 20 },
    { distance: 50, damage: 20 },
  ];

  it('reads the flat, linear and reduced segments', () => {
    expect(damageAtDistance(points, 5)).toBe(40);
    expect(damageAtDistance(points, 10)).toBe(40);
    expect(damageAtDistance(points, 20)).toBe(30);
    expect(damageAtDistance(points, 30)).toBe(20);
    expect(damageAtDistance(points, 50)).toBe(20);
  });

  it('clamps outside the curve instead of extrapolating', () => {
    expect(damageAtDistance(points, -5)).toBe(40);
    expect(damageAtDistance(points, 500)).toBe(20);
    expect(damageAtDistance([], 10)).toBeNull();
    expect(damageAtDistance(points, Number.NaN)).toBeNull();
  });
});
