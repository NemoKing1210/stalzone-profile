<script setup lang="ts">
import type { PropType } from 'vue';

import type { FalloffPlot } from '../model/damageFalloff';

const props = defineProps({
  plot: { type: Object as PropType<FalloffPlot>, required: true },
});

const view = computed(() => props.plot.view);
const plotWidth = computed(() => view.value.width - view.value.left - view.value.right);
const plotHeight = computed(() => view.value.height - view.value.top - view.value.bottom);
const labelY = computed(() => view.value.top + plotHeight.value + view.value.font + 2);
</script>

<template>
  <svg
    class="block h-auto w-full"
    :viewBox="`0 0 ${view.width} ${view.height}`"
    role="img"
    preserveAspectRatio="xMidYMid meet"
  >
    <title>{{ $t('items.falloff.title') }}</title>
    <desc>{{ $t('items.falloff.description') }}</desc>

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
        text-anchor="middle"
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
        {{ $t('items.falloff.axisDistance') }}
      </text>
      <text
        :x="Math.max(8, view.font)"
        :y="view.top + plotHeight / 2"
        text-anchor="middle"
        fill="var(--sz-text-dim)"
        :transform="`rotate(-90 ${Math.max(8, view.font)} ${view.top + plotHeight / 2})`"
      >
        {{ $t('items.falloff.axisDamage') }}
      </text>
    </g>

    <g fill="none" stroke-linejoin="round" stroke-linecap="round">
      <path
        v-for="line in plot.lines"
        :key="`line-${line.level}`"
        :d="line.d"
        :stroke="line.color"
        stroke-width="1.25"
        :stroke-dasharray="line.dashed ? '4 3' : undefined"
        vector-effect="non-scaling-stroke"
      />
    </g>

    <g>
      <template v-for="line in plot.lines" :key="`points-${line.level}`">
        <circle
          v-for="point in line.points"
          :key="point.key"
          :cx="point.x"
          :cy="point.y"
          :r="view.marker"
          :fill="line.dashed ? 'var(--sz-surface-alt)' : line.color"
          :stroke="line.color"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        >
          <title>{{ point.label }}</title>
        </circle>
      </template>
    </g>
  </svg>
</template>
