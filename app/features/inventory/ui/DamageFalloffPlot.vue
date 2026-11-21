<script setup lang="ts">
import type { FalloffPlot } from '../model/damageFalloff';

const props = withDefaults(
  defineProps<{
    plot: FalloffPlot;
    /** The series to keep bright while the rest fade, or null for a flat legend. */
    activeKey?: string | null;
    /** A vertical guide at this viewBox x, or null when the pointer is away. */
    guideX?: number | null;
    /** Emit `hover` with the viewBox x under the pointer; off for static charts. */
    interactive?: boolean;
  }>(),
  { activeKey: null, guideX: null, interactive: false },
);

const emit = defineEmits<{ hover: [x: number | null] }>();

const view = computed(() => props.plot.view);
const plotWidth = computed(() => view.value.width - view.value.left - view.value.right);
const plotHeight = computed(() => view.value.height - view.value.top - view.value.bottom);
const labelY = computed(() => view.value.top + plotHeight.value + view.value.font + 2);
const dimmed = (key: string): boolean => props.activeKey != null && props.activeKey !== key;

/**
 * The SVG is drawn with `width: 100%` and an aspect-ratio-preserving viewBox, so its CSS
 * box maps linearly onto the viewBox; no letterboxing is added.
 */
function onPointerMove(event: PointerEvent): void {
  if (!props.interactive) return;
  const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
  if (!rect.width) return;
  emit('hover', ((event.clientX - rect.left) / rect.width) * view.value.width);
}

function onPointerLeave(): void {
  if (props.interactive) emit('hover', null);
}
</script>

<template>
  <svg
    class="block h-auto w-full"
    :viewBox="`0 0 ${view.width} ${view.height}`"
    role="img"
    preserveAspectRatio="xMidYMid meet"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
  >
    <title>{{ plot.title }}</title>
    <desc>{{ plot.description }}</desc>

    <g stroke="var(--sz-border)" stroke-width="0.5" shape-rendering="crispEdges">
      <line
        v-for="y in plot.yGrid"
        :key="`gy-${y}`"
        :x1="view.left"
        :y1="y"
        :x2="view.left + plotWidth"
        :y2="y"
      />
      <line
        :x1="view.left"
        :y1="view.top"
        :x2="view.left"
        :y2="view.top + plotHeight"
        stroke="var(--sz-border-strong)"
      />
    </g>

    <g fill="var(--sz-text-muted)" :font-size="view.font">
      <text
        v-for="tick in plot.xTicks"
        :key="`tx-${tick.x}`"
        :x="tick.x"
        :y="labelY"
        :text-anchor="tick.x <= view.left + 0.01 ? 'start' : tick.x >= view.left + plotWidth - 0.01 ? 'end' : 'middle'"
      >
        {{ tick.label }}
      </text>
      <text
        v-for="tick in plot.yTicks"
        :key="`ty-${tick.y}`"
        :x="view.left - 5"
        :y="tick.y + view.font * 0.375"
        text-anchor="end"
      >
        {{ tick.label }}
      </text>
      <text
        :x="view.left + plotWidth"
        :y="view.height - 3"
        text-anchor="end"
        fill="var(--sz-text-dim)"
      >
        {{ plot.xTitle }}
      </text>
      <text
        :x="Math.max(8, view.font)"
        :y="view.top + plotHeight / 2"
        text-anchor="middle"
        fill="var(--sz-text-dim)"
        :transform="`rotate(-90 ${Math.max(8, view.font)} ${view.top + plotHeight / 2})`"
      >
        {{ plot.yTitle }}
      </text>
    </g>

    <line
      v-if="guideX != null"
      :x1="guideX"
      :y1="view.top"
      :x2="guideX"
      :y2="view.top + plotHeight"
      stroke="var(--sz-border-strong)"
      stroke-width="1"
      stroke-dasharray="2 3"
      vector-effect="non-scaling-stroke"
    />

    <g fill="none" stroke-linejoin="round" stroke-linecap="round">
      <path
        v-for="line in plot.lines"
        :key="`line-${line.key}`"
        :d="line.d"
        :stroke="line.color"
        stroke-width="1.25"
        :stroke-dasharray="line.dashed ? '4 3' : undefined"
        :opacity="dimmed(line.key) ? 0.18 : 1"
        vector-effect="non-scaling-stroke"
      >
        <title>{{ line.label }}</title>
      </path>
    </g>

    <g v-if="view.marker > 0">
      <template v-for="line in plot.lines" :key="`points-${line.key}`">
        <circle
          v-for="point in line.points"
          :key="point.key"
          :cx="point.x"
          :cy="point.y"
          :r="view.marker"
          :fill="line.dashed ? 'var(--sz-surface-alt)' : line.color"
          :stroke="line.color"
          stroke-width="1"
          :opacity="dimmed(line.key) ? 0.18 : 1"
          vector-effect="non-scaling-stroke"
        >
          <title>{{ point.label }}</title>
        </circle>
      </template>
    </g>
  </svg>
</template>
