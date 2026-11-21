import type { DamagePoint } from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';

import { buildWeaponChart, chartScale, seriesColor } from '~/features/inventory/model/weaponChart';

function point(overrides: Partial<DamagePoint> = {}): DamagePoint {
  return { d0: 40, dB: 20, distA: 10, distB: 30, distMax: 50, ...overrides };
}

describe('buildWeaponChart', () => {
  it('makes one curve per row with a stable palette color', () => {
    const chart = buildWeaponChart(
      [
        { key: 'a', name: 'A', rof: 600, p0: point(), p15: point({ d0: 60 }) },
        { key: 'b', name: 'B', rof: 400, p0: point({ d0: 25, dB: 10, distMax: 70 }), p15: null },
      ],
      0,
    );

    expect(chart?.series.map((series) => [series.key, series.color])).toEqual([
      ['a', 'var(--sz-series-1)'],
      ['b', 'var(--sz-series-2)'],
    ]);
    expect(chart?.series[0]).toMatchObject({ falloffEnd: 30, maxDistance: 50 });
    expect(chart?.series[1]).toMatchObject({ falloffEnd: 30, maxDistance: 70 });
    expect(chart?.series[0]!.points[0]).toEqual({ distance: 0, damage: 40 });
  });

  it('switches every curve to the selected level', () => {
    const chart = buildWeaponChart([{ key: 'a', name: 'A', rof: 600, p0: point(), p15: point({ d0: 60 }) }], 15);
    expect(chart?.series[0]!.points[0]).toEqual({ distance: 0, damage: 60 });
  });

  it('skips rows without a complete curve and returns null when nothing is plottable', () => {
    const chart = buildWeaponChart(
      [
        { key: 'a', name: 'A', rof: 600, p0: null, p15: null },
        { key: 'b', name: 'B', rof: 600, p0: point({ dB: null }), p15: null },
      ],
      0,
    );
    expect(chart).toBeNull();
    expect(buildWeaponChart([], 0)).toBeNull();
  });

  it('ends the x axis at the furthest falloff end, not the furthest range', () => {
    const chart = buildWeaponChart(
      [
        { key: 'a', name: 'A', rof: 600, p0: point({ distB: 30 }), p15: null },
        { key: 'b', name: 'B', rof: 600, p0: point({ d0: 80, distB: 60, distMax: 400 }), p15: null },
      ],
      0,
    );
    expect(chart?.maxDistance).toBe(60);
    expect(chart?.maxDamage).toBe(80);
    expect(chart?.xTicks).toEqual([0, 15, 30, 45, 60]);
    expect(chart?.yTicks).toEqual([0, 20, 40, 60, 80]);
  });
});

describe('seriesColor', () => {
  it('cycles the ten tokens', () => {
    expect(seriesColor(0)).toBe('var(--sz-series-1)');
    expect(seriesColor(9)).toBe('var(--sz-series-10)');
    expect(seriesColor(10)).toBe('var(--sz-series-1)');
  });
});

describe('chartScale', () => {
  it('rescales the axes to the curves actually drawn', () => {
    const chart = buildWeaponChart(
      [
        { key: 'a', name: 'A', rof: 600, p0: point(), p15: null },
        { key: 'b', name: 'B', rof: 600, p0: point({ d0: 200, distB: 50, distMax: 400 }), p15: null },
      ],
      0,
    )!;
    expect(chartScale([chart.series[0]!])).toMatchObject({
      maxDistance: 30,
      maxDamage: 40,
      xTicks: [0, 7.5, 15, 22.5, 30],
      yTicks: [0, 10, 20, 30, 40],
    });
    expect(chartScale([chart.series[1]!])).toMatchObject({ maxDistance: 50, maxDamage: 200 });
    expect(chartScale([])).toBeNull();
  });
});
