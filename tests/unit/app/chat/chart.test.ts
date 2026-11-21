import { describe, expect, it } from 'vitest';

import { buildChatChart, chartBars, type ChatChartData } from '~/features/chat/model/chart';
import type { ChatItemView } from '~/features/chat/model/render';

function item(name: string): ChatItemView {
  return {
    name,
    rank: 'RANK_MASTER',
    kind: 'weapon',
    category: 'weapon/assault_rifle',
    icon: null,
    itemId: null,
    instanceId: null,
    level: 15,
    qty: null,
    virtual: false,
    location: null,
    weight: null,
  };
}

function chartOf(rows: { name: string; metrics: Record<string, unknown> }[]): ChatChartData {
  const chart = buildChatChart(
    rows.map((row) => ({ item: item(row.name), metrics: row.metrics })),
    15,
    600,
  );
  if (!chart) throw new Error('expected a chart');
  return chart;
}

describe('chat chart', () => {
  it('offers only metrics two items share and prefers TTK', () => {
    const chart = chartOf([
      { name: 'АК-12', metrics: { ttk: 0.6, dps: 200, weight: 3.5 } },
      { name: 'АК-15', metrics: { ttk: 0.5, dps: 210 } },
    ]);
    expect(chart.metrics.map((metric) => metric.key)).toEqual(['ttk', 'dps']);
    expect(chart.defaultMetric).toBe('ttk');
    expect(chart.level).toBe(15);
    expect(chart.hp).toBe(600);
  });

  it('sorts a lower-is-better metric ascending and marks the best', () => {
    const chart = chartOf([
      { name: 'АК-12', metrics: { ttk: 0.6 } },
      { name: 'АК-15', metrics: { ttk: 0.5 } },
      { name: 'АК-308', metrics: { ttk: 0.8 } },
    ]);
    expect(chartBars(chart, 'ttk').map((bar) => [bar.series.item.name, bar.value, bar.best])).toEqual([
      ['АК-15', 0.5, true],
      ['АК-12', 0.6, false],
      ['АК-308', 0.8, false],
    ]);
    const bars = chartBars(chart, 'ttk');
    expect(bars[0]?.ratio).toBe(1);
    expect(bars[2]?.ratio).toBeLessThan(0.2);
  });

  it('sorts a higher-is-better metric descending and skips a missing value', () => {
    const chart = chartOf([
      { name: 'АК-12', metrics: { dps: 200 } },
      { name: 'АК-15', metrics: { dps: 210 } },
      { name: 'АК-308', metrics: { dps: null } },
    ]);
    expect(chartBars(chart, 'dps').map((bar) => [bar.series.item.name, bar.best])).toEqual([
      ['АК-15', true],
      ['АК-12', false],
    ]);
  });

  it('builds no chart for a single item or a summary without metrics', () => {
    expect(buildChatChart([{ item: item('АК-12'), metrics: { ttk: 0.5 } }], 15, 600)).toBeNull();
    expect(
      buildChatChart(
        [
          { item: item('АК-12'), metrics: {} },
          { item: item('АК-15'), metrics: {} },
        ],
        15,
        600,
      ),
    ).toBeNull();
  });
});
