<script setup lang="ts">
import { displayDps, displayTtk } from '@profile/shared/calc';

import { damageAtDistance, type FalloffPlot, type FalloffPlotLine, type FalloffView } from '../model/damageFalloff';
import type { WeaponRow } from '../model/kinds/weapons';
import { buildWeaponChart, chartScale, type WeaponChartSeries } from '../model/weaponChart';
import DamageFalloffPlot from './DamageFalloffPlot.vue';

const props = withDefaults(defineProps<{ rows: WeaponRow[]; hp?: number }>(), { hp: 600 });

const { t, locale } = useI18n();
const { g1, g2, num } = useFormat();

/** The chart is a reading surface: ten series stay distinguishable, the legend owns the rest. */
const DEFAULT_VISIBLE = 10;
const COMPACT: FalloffView = { width: 330, height: 170, left: 38, right: 14, top: 10, bottom: 32, font: 9, marker: 0 };
const WIDE: FalloffView = { width: 980, height: 260, left: 52, right: 22, top: 12, bottom: 38, font: 11, marker: 0 };

const level = ref<0 | 15>(0);
const visible = ref<string[]>([]);
const activeKey = ref<string | null>(null);
const hoverDistance = ref(0);

const axis = computed(
  () =>
    new Intl.NumberFormat(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
      maximumFractionDigits: 1,
    }),
);

const chart = computed(() => buildWeaponChart(props.rows, level.value));
const plottable = computed(() => chart.value?.series ?? []);
const keys = computed(() => plottable.value.map((series) => series.key));
const rowsByKey = computed(() => new Map(props.rows.map((row) => [row.key, row])));
const shownSeries = computed(() => plottable.value.filter((series) => visible.value.includes(series.key)));
/** Axes follow the curves actually drawn; showing all widens them to the full set. */
const scale = computed(() => chartScale(shownSeries.value) ?? chartScale(plottable.value));
const noDataCount = computed(() => props.rows.length - plottable.value.length);

/** A filter change keeps the owner's selection; a fresh list starts with its first ten rows. */
watch(
  keys,
  (next) => {
    const kept = visible.value.filter((key) => next.includes(key));
    visible.value = kept.length ? kept : next.slice(0, DEFAULT_VISIBLE);
  },
  { immediate: true },
);

const legend = computed(() =>
  plottable.value.map((series) => {
    const row = rowsByKey.value.get(series.key);
    const damage = series.points[0]?.damage ?? null;
    return {
      ...series,
      dps: displayDps(damage, row?.rof ?? null),
      ttk: displayTtk(damage, row?.rof ?? null, props.hp),
    };
  }),
);

const allVisible = computed(() => plottable.value.length > 0 && visible.value.length === plottable.value.length);

function toggle(key: string): void {
  visible.value = visible.value.includes(key)
    ? visible.value.filter((current) => current !== key)
    : [...visible.value, key];
}

function showAll(): void {
  visible.value = [...keys.value];
}

function hideAll(): void {
  visible.value = [];
}

/** The curve is drawn to the axis end; a flat tail is closed at the edge, never cut mid-slope. */
function drawnPoints(series: WeaponChartSeries): { distance: number; damage: number }[] {
  const domain = scale.value?.maxDistance ?? 0;
  const inside = series.points.filter((point) => point.distance <= domain);
  const last = inside[inside.length - 1];
  if (last && last.distance < domain && series.maxDistance >= domain) {
    return [...inside, { distance: domain, damage: last.damage }];
  }
  return inside;
}

function buildPlot(view: FalloffView): FalloffPlot {
  const maxX = scale.value?.maxDistance || 1;
  const maxY = scale.value?.maxDamage || 1;
  const plotWidth = view.width - view.left - view.right;
  const plotHeight = view.height - view.top - view.bottom;
  const px = (distance: number): number => view.left + (distance / maxX) * plotWidth;
  const py = (damage: number): number => view.top + plotHeight - (damage / maxY) * plotHeight;

  const lines: FalloffPlotLine[] = shownSeries.value.map((series) => {
    const points = drawnPoints(series);
    return {
      key: series.key,
      label: series.name,
      color: series.color,
      d: points.map((point, index) => `${index ? 'L' : 'M'}${px(point.distance)} ${py(point.damage)}`).join(' '),
      points: points.map((point) => ({
        key: `${series.key}-${point.distance}`,
        x: px(point.distance),
        y: py(point.damage),
        label: t('weapons.chart.point', {
          name: series.name,
          damage: g1(point.damage),
          distance: axis.value.format(point.distance),
        }),
        distance: point.distance,
        damage: point.damage,
      })),
    };
  });

  const xTicks = (scale.value?.xTicks ?? []).map((value) => ({ x: px(value), label: axis.value.format(value) }));
  const yTicks = (scale.value?.yTicks ?? []).map((value) => ({ y: py(value), label: axis.value.format(value) }));
  return {
    view,
    title: t('weapons.chart.title'),
    description: t('weapons.chart.description'),
    lines,
    xTicks,
    yTicks,
    yGrid: yTicks.map((tick) => tick.y),
    xTitle: t('items.falloff.axisDistance'),
    yTitle: t('items.falloff.axisDamage'),
  };
}

const plots = computed(() =>
  chart.value
    ? [
        { key: 'compact', visibility: 'md:hidden', chart: buildPlot(COMPACT) },
        { key: 'wide', visibility: 'hidden md:block', chart: buildPlot(WIDE) },
      ]
    : [],
);

function onHover(plot: FalloffPlot, x: number | null): void {
  const max = scale.value?.maxDistance;
  if (x == null || !max) return;
  const width = plot.view.width - plot.view.left - plot.view.right;
  const local = Math.min(Math.max(x - plot.view.left, 0), width);
  hoverDistance.value = (local / width) * max;
}

function guideXFor(plot: FalloffPlot): number | null {
  const max = scale.value?.maxDistance;
  if (!max) return null;
  const width = plot.view.width - plot.view.left - plot.view.right;
  return plot.view.left + (hoverDistance.value / max) * width;
}

/** Every visible weapon reads at the crosshair; past its own range it has no value, not a guess. */
const hoverRows = computed(() =>
  shownSeries.value.map((series) => {
    const row = rowsByKey.value.get(series.key);
    const distance = hoverDistance.value;
    const damage = distance > series.maxDistance ? null : damageAtDistance(series.points, distance);
    return {
      key: series.key,
      name: series.name,
      color: series.color,
      damage,
      ttk: displayTtk(damage, row?.rof ?? null, props.hp),
    };
  }),
);

const hoverDistanceLabel = computed(() => axis.value.format(hoverDistance.value));

/** A screen reader gets each drawn curve as one sentence instead of a wall of point labels. */
function seriesSummary(series: { name: string; points: { distance: number; damage: number }[] }): string {
  const first = series.points[0];
  const last = series.points[series.points.length - 1];
  return t('weapons.chart.srSeries', {
    name: series.name,
    from: g1(first?.damage),
    to: g1(last?.damage),
    distance: axis.value.format(last?.distance ?? 0),
  });
}
</script>

<template>
  <section class="space-y-2" :aria-label="t('weapons.chart.title')">
    <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div class="flex flex-wrap items-baseline gap-x-2">
        <h2 class="sz-caps text-[11px] text-[var(--sz-text-muted)]">{{ t('weapons.chart.title') }}</h2>
        <span class="text-[10.5px] tabular-nums text-[var(--sz-text-dim)]">
          {{ t('weapons.chart.shown', { shown: visible.length, total: plottable.length }) }}
        </span>
        <span class="text-[10.5px] text-[var(--sz-text-dim)]">{{ t('weapons.chart.trim') }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[10.5px] text-[var(--sz-text-dim)]">{{ t('weapons.chart.level') }}</span>
        <div class="flex gap-1" role="group" :aria-label="t('weapons.chart.level')">
          <UButton
            size="xs"
            :color="level === 0 ? 'primary' : 'neutral'"
            :variant="level === 0 ? 'solid' : 'ghost'"
            :aria-pressed="level === 0"
            label="0"
            @click="level = 0"
          />
          <UButton
            size="xs"
            :color="level === 15 ? 'primary' : 'neutral'"
            :variant="level === 15 ? 'solid' : 'ghost'"
            :aria-pressed="level === 15"
            label="+15"
            @click="level = 15"
          />
        </div>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t('weapons.chart.showAll')"
          :disabled="allVisible"
          @click="showAll"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t('weapons.chart.hideAll')"
          :disabled="!visible.length"
          @click="hideAll"
        />
      </div>
    </header>

    <div v-if="plots.length" class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2 pb-1 pt-1.5">
      <DamageFalloffPlot
        v-for="plot in plots"
        :key="plot.key"
        :class="plot.visibility"
        :plot="plot.chart"
        :active-key="activeKey"
        :guide-x="guideXFor(plot.chart)"
        interactive
        @hover="(x) => onHover(plot.chart, x)"
      />
    </div>
    <p v-else class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2 py-6 text-center text-[11px] text-[var(--sz-text-dim)]">
      {{ t('weapons.chart.empty') }}
    </p>

    <div class="flex h-24 flex-col border border-[var(--sz-border)] bg-[var(--sz-surface-header)]">
      <div class="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-[var(--sz-border)] px-2 py-1">
        <span class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">
          {{ t('weapons.chart.atDistance', { distance: hoverDistanceLabel }) }}
        </span>
        <span class="text-[10px] text-[var(--sz-text-dim)]">{{ t('weapons.chart.hoverHint') }}</span>
      </div>
      <div class="min-h-0 flex-1 overflow-auto px-2 py-1">
        <ul v-if="hoverRows.length" class="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
          <li v-for="entry in hoverRows" :key="`hover-${entry.key}`" class="flex items-baseline gap-1.5 text-[11px]">
            <span class="h-2 w-2 shrink-0" :style="{ background: entry.color }" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate" :title="entry.name">{{ entry.name }}</span>
            <span class="tabular-nums">{{ entry.damage == null ? '—' : g1(entry.damage) }}</span>
            <span class="tabular-nums text-[var(--sz-text-muted)]">{{ entry.ttk == null ? '—' : g2(entry.ttk) }}</span>
          </li>
        </ul>
        <p v-else class="text-[11px] text-[var(--sz-text-dim)]">{{ t('weapons.chart.noSeries') }}</p>
      </div>
    </div>

    <div v-if="legend.length" class="border border-[var(--sz-border)]">
      <div class="flex items-baseline gap-2 border-b border-[var(--sz-border)] bg-[var(--sz-surface-header)] px-2 py-1 text-[10px] text-[var(--sz-text-muted)]">
        <span class="min-w-0 flex-1">{{ t('weapons.chart.weapon') }}</span>
        <span class="w-12 text-right">DPS</span>
        <span class="w-12 text-right">TTK</span>
      </div>
      <ul class="max-h-80 divide-y divide-[var(--sz-border)] overflow-auto">
        <li v-for="entry in legend" :key="`legend-${entry.key}`">
          <button
            type="button"
            class="flex w-full items-baseline gap-2 px-2 py-1 text-left text-[11px] hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sz-accent)]"
            :aria-pressed="visible.includes(entry.key)"
            :class="visible.includes(entry.key) ? '' : 'text-[var(--sz-text-dim)]'"
            :title="t('weapons.chart.upTo', { name: entry.name, distance: axis.format(entry.maxDistance) })"
            @click="toggle(entry.key)"
            @mouseenter="activeKey = entry.key"
            @mouseleave="activeKey = null"
            @focus="activeKey = entry.key"
            @blur="activeKey = null"
          >
            <span class="h-2 w-2 shrink-0" :style="{ background: entry.color }" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ entry.name }}</span>
            <span class="w-12 text-right tabular-nums">{{ entry.dps == null ? '—' : num(entry.dps) }}</span>
            <span class="w-12 text-right tabular-nums">{{ entry.ttk == null ? '—' : g2(entry.ttk) }}</span>
          </button>
        </li>
      </ul>
    </div>

    <p v-if="noDataCount" class="text-[10.5px] text-[var(--sz-text-dim)]">
      {{ t('weapons.chart.noData', { count: noDataCount }) }}
    </p>

    <ul class="sr-only">
      <li v-for="series in shownSeries" :key="`sr-${series.key}`">{{ seriesSummary(series) }}</li>
    </ul>
  </section>
</template>
