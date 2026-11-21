<script setup lang="ts">
import type { DamagePoint } from '@profile/shared/contracts';

import type { FalloffData, FalloffPlot, FalloffPlotLine, FalloffView } from '../model/damageFalloff';
import { damageFalloff } from '../model/damageFalloff';
import DamageFalloffPlot from './DamageFalloffPlot.vue';

const props = withDefaults(defineProps<{ p0?: DamagePoint | null; p15?: DamagePoint | null }>(), {
  p0: null,
  p15: null,
});

const { t, locale } = useI18n();
const { dec } = useFormat();

/** Below `md` the plot fills a phone-width column; above it, a wide canvas fills the modal. */
const COMPACT: FalloffView = { width: 300, height: 124, left: 34, right: 6, top: 10, bottom: 26, font: 8, marker: 2 };
const WIDE: FalloffView = { width: 900, height: 190, left: 52, right: 14, top: 16, bottom: 40, font: 10, marker: 2.5 };

/** A scale is read at a glance, so its ticks stop at one decimal (the point list keeps two). */
const axis = computed(
  () =>
    new Intl.NumberFormat(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
      maximumFractionDigits: 1,
    }),
);
const tickLabel = (value: number): string => axis.value.format(value);

function buildPlot(data: FalloffData, view: FalloffView): FalloffPlot {
  const plotWidth = view.width - view.left - view.right;
  const plotHeight = view.height - view.top - view.bottom;
  const maxX = data.maxDistance || 1;
  const maxY = data.maxDamage || 1;
  const px = (distance: number): number => view.left + (distance / maxX) * plotWidth;
  const py = (damage: number): number => view.top + plotHeight - (damage / maxY) * plotHeight;

  const lines: FalloffPlotLine[] = data.series.map((series) => {
    const label = series.level === 0 ? t('items.falloff.base') : t('items.falloff.plus15');
    return {
      key: `level-${series.level}`,
      label,
      color: series.level === 0 ? 'var(--sz-text)' : 'var(--sz-text-muted)',
      dashed: series.level !== 0,
      d: series.points.map((point, index) => `${index ? 'L' : 'M'}${px(point.distance)} ${py(point.damage)}`).join(' '),
      points: series.points.map((point) => ({
        key: `${series.level}-${point.distance}-${point.damage}`,
        x: px(point.distance),
        y: py(point.damage),
        label: t('items.falloff.point', {
          level: label,
          damage: dec(point.damage),
          distance: dec(point.distance),
        }),
        distance: point.distance,
        damage: point.damage,
      })),
    };
  });

  const xValues = [0, maxX / 2, maxX];
  const yValues = [0, maxY / 2, maxY];
  return {
    view,
    title: t('items.falloff.title'),
    description: t('items.falloff.description'),
    // Dashed +15 sits under the base curve so the two only cross where the data says so.
    lines: [...lines].sort((a, b) => Number(a.dashed) - Number(b.dashed)),
    xTicks: xValues.map((value) => ({ x: px(value), label: tickLabel(value) })),
    yTicks: yValues.map((value) => ({ y: py(value), label: tickLabel(value) })),
    yGrid: yValues.map((value) => py(value)),
    xTitle: t('items.falloff.axisDistance'),
    yTitle: t('items.falloff.axisDamage'),
  };
}

const plots = computed(() => {
  const data = damageFalloff({ p0: props.p0, p15: props.p15 });
  if (!data) return [] as { key: string; visibility: string; chart: FalloffPlot }[];
  return [
    { key: 'compact', visibility: 'md:hidden', chart: buildPlot(data, COMPACT) },
    { key: 'wide', visibility: 'hidden md:block', chart: buildPlot(data, WIDE) },
  ];
});
const legend = computed(() => plots.value[0]?.chart.lines ?? []);
const points = computed(() => legend.value.flatMap((line) => line.points));
</script>

<template>
  <section class="space-y-1">
    <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('items.falloff.title') }}</h3>
      <ul v-if="legend.length" class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[10px] text-[var(--sz-text-muted)]">
        <li v-for="line in legend" :key="`legend-${line.key}`" class="inline-flex items-center gap-1">
          <svg width="14" height="4" aria-hidden="true">
            <line
              x1="0"
              y1="2"
              x2="14"
              y2="2"
              :stroke="line.color"
              stroke-width="1.25"
              :stroke-dasharray="line.dashed ? '3 2' : undefined"
            />
          </svg>
          {{ line.label }}
        </li>
      </ul>
    </div>

    <div v-if="plots.length" class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2 pb-1 pt-1.5">
      <DamageFalloffPlot
        v-for="plot in plots"
        :key="plot.key"
        :class="plot.visibility"
        :plot="plot.chart"
      />

      <ul class="sr-only">
        <li v-for="point in points" :key="point.key">{{ point.label }}</li>
      </ul>
    </div>

    <p v-else class="text-[11px] text-[var(--sz-text-dim)]">{{ t('items.falloff.noData') }}</p>
  </section>
</template>
