import type { ChatItemView } from './types';

export type ChartDirection = 'higher' | 'lower';

/** One displayable metric: the label lives in i18n, the unit is a short literal. */
export interface ChatChartMetric {
  key: string;
  labelKey: string;
  unit: string | null;
  direction: ChartDirection;
  /** Decimal places for the value label. */
  precision: number;
}

export interface ChatChartSeries {
  key: string;
  item: ChatItemView;
  values: Record<string, number>;
}

export interface ChatChartData {
  metrics: ChatChartMetric[];
  series: ChatChartSeries[];
  defaultMetric: string;
  level: number | null;
  hp: number | null;
}

export interface ChatChartBar {
  series: ChatChartSeries;
  value: number;
  /** Best-to-worst spread, 0.08…1; the bar length, independent of the raw unit. */
  ratio: number;
  best: boolean;
}

/**
 * Metric vocabulary the chat chart knows how to label. Order is the preference order when
 * several metrics are present; a metric with fewer than two numeric rows is not offered.
 */
const METRICS: readonly ChatChartMetric[] = [
  { key: 'ttk', labelKey: 'chat.chart.metrics.ttk', unit: 's', direction: 'lower', precision: 2 },
  { key: 'dps', labelKey: 'chat.chart.metrics.dps', unit: null, direction: 'higher', precision: 0 },
  { key: 'damage', labelKey: 'chat.chart.metrics.damage', unit: 'hp', direction: 'higher', precision: 1 },
  { key: 'rof', labelKey: 'chat.chart.metrics.rof', unit: 'rpm', direction: 'higher', precision: 0 },
  { key: 'recoil', labelKey: 'chat.chart.metrics.recoil', unit: null, direction: 'lower', precision: 1 },
  { key: 'spread', labelKey: 'chat.chart.metrics.spread', unit: null, direction: 'lower', precision: 2 },
  { key: 'mag', labelKey: 'chat.chart.metrics.mag', unit: null, direction: 'higher', precision: 0 },
  { key: 'weight', labelKey: 'chat.chart.metrics.weight', unit: 'kg', direction: 'lower', precision: 2 },
  { key: 'ergonomics', labelKey: 'chat.chart.metrics.ergonomics', unit: null, direction: 'higher', precision: 0 },
  { key: 'pierce', labelKey: 'chat.chart.metrics.pierce', unit: null, direction: 'higher', precision: 0 },
  { key: 'platePen', labelKey: 'chat.chart.metrics.platePen', unit: null, direction: 'higher', precision: 0 },
  { key: 'reload', labelKey: 'chat.chart.metrics.reload', unit: 's', direction: 'lower', precision: 2 },
  { key: 'aim', labelKey: 'chat.chart.metrics.aim', unit: 's', direction: 'lower', precision: 2 },
  { key: 'draw', labelKey: 'chat.chart.metrics.draw', unit: 's', direction: 'lower', precision: 2 },
  { key: 'hipSpread', labelKey: 'chat.chart.metrics.hipSpread', unit: null, direction: 'lower', precision: 2 },
];

function numeric(metrics: Record<string, unknown>, key: string): number | null {
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Builds the chart a tool result can support: at least two items and one metric they share.
 * Returns null when the payload is a summary, a single item, or has no numeric metrics.
 */
export function buildChatChart(
  rows: readonly { item: ChatItemView; metrics: Record<string, unknown> }[],
  level: number | null,
  hp: number | null,
): ChatChartData | null {
  if (rows.length < 2) return null;
  const series: ChatChartSeries[] = rows.map((row, index) => {
    const values: Record<string, number> = {};
    for (const metric of METRICS) {
      const value = numeric(row.metrics, metric.key);
      if (value != null) values[metric.key] = value;
    }
    return { key: `${row.item.name}-${index}`, item: row.item, values };
  });
  const metrics = METRICS.filter(
    (metric) => series.filter((entry) => entry.values[metric.key] != null).length >= 2,
  );
  if (!metrics.length) return null;
  const preferred = metrics.find((metric) => metric.key === 'ttk') ?? metrics.find((metric) => metric.key === 'dps');
  return { metrics: [...metrics], series, defaultMetric: preferred?.key ?? metrics[0]!.key, level, hp };
}

/** Bars for one metric, best first; ties both carry the best mark. */
export function chartBars(chart: ChatChartData, metricKey: string): ChatChartBar[] {
  const metric = chart.metrics.find((entry) => entry.key === metricKey);
  if (!metric) return [];
  const bars = chart.series.flatMap((series) => {
    const value = series.values[metric.key];
    return typeof value === 'number' ? [{ series, value }] : [];
  });
  if (!bars.length) return [];
  const values = bars.map((bar) => bar.value);
  const best = metric.direction === 'higher' ? Math.max(...values) : Math.min(...values);
  const worst = metric.direction === 'higher' ? Math.min(...values) : Math.max(...values);
  // Bar length is the spread between best and worst, not value/max: close TTK values would
  // otherwise draw almost equal bars. The value label keeps the exact number.
  const quality = (value: number): number => {
    if (best === worst) return 1;
    const position = metric.direction === 'higher' ? (value - worst) / (best - worst) : (worst - value) / (worst - best);
    return 0.08 + 0.92 * Math.min(1, Math.max(0, position));
  };
  return bars
    .sort((left, right) =>
      metric.direction === 'higher' ? right.value - left.value : left.value - right.value,
    )
    .map((bar) => ({ ...bar, ratio: quality(bar.value), best: bar.value === best }));
}
