<script setup lang="ts">
import { RankBadge } from '~/entities/item';

import { chartBars, type ChatChartData } from '../model/chart';
import { chatItemLink, type ChatItemView } from '../model/render';

const props = defineProps<{ chart: ChatChartData }>();
const emit = defineEmits<{ openItem: [item: ChatItemView] }>();

const { t } = useI18n();
const { num, g1, g2 } = useFormat();
const selected = ref(props.chart.defaultMetric);

watch(
  () => props.chart,
  (chart) => {
    selected.value = chart.defaultMetric;
  },
);

const metric = computed(() => props.chart.metrics.find((entry) => entry.key === selected.value) ?? props.chart.metrics[0]);
const bars = computed(() => chartBars(props.chart, metric.value?.key ?? ''));
const context = computed(() => {
  const parts: string[] = [];
  if (props.chart.level != null) parts.push(t('chat.chart.level', { level: props.chart.level }));
  if (metric.value?.key === 'ttk' && props.chart.hp != null) parts.push(t('chat.chart.hp', { hp: props.chart.hp }));
  return parts.join(' · ');
});

function formatValue(value: number): string {
  const precision = metric.value?.precision ?? 0;
  const text = precision === 0 ? num(value) : precision === 1 ? g1(value) : g2(value);
  return metric.value?.unit ? `${text} ${metric.value.unit}` : text;
}

function open(item: ChatItemView): void {
  if (chatItemLink(item)) emit('openItem', item);
}
</script>

<template>
  <section
    v-if="metric && bars.length"
    class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)]/40 p-2"
    :aria-label="t('chat.chart.title')"
  >
    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span class="sz-caps text-[10px] text-[var(--sz-text-muted)]">{{ t('chat.chart.title') }}</span>
      <span class="text-[12px] text-[var(--sz-text)]">{{ t(metric.labelKey) }}</span>
      <span v-if="context" class="text-[10px] tabular-nums text-[var(--sz-text-dim)]">{{ context }}</span>
      <span class="ms-auto text-[10px] text-[var(--sz-text-dim)]">
        {{ t(metric.direction === 'lower' ? 'chat.chart.lowerBetter' : 'chat.chart.higherBetter') }}
      </span>
    </div>

    <div v-if="props.chart.metrics.length > 1" class="mt-1.5 flex flex-wrap gap-1" role="group" :aria-label="t('chat.chart.metric')">
      <button
        v-for="entry in props.chart.metrics"
        :key="entry.key"
        type="button"
        class="border px-1.5 py-0.5 text-[10.5px] transition-colors"
        :class="
          entry.key === metric.key
            ? 'border-[var(--sz-accent)] bg-[var(--sz-accent)]/15 text-[var(--sz-text)]'
            : 'border-[var(--sz-border)] text-[var(--sz-text-muted)] hover:border-[var(--sz-border-strong)] hover:text-[var(--sz-text)]'
        "
        :aria-pressed="entry.key === metric.key"
        @click="selected = entry.key"
      >
        {{ t(entry.labelKey) }}
      </button>
    </div>

    <ul class="mt-2 space-y-1.5">
      <li v-for="bar in bars" :key="bar.series.key">
        <button
          type="button"
          class="group w-full text-left disabled:cursor-default"
          :disabled="!chatItemLink(bar.series.item)"
          :aria-label="t('chat.chart.open', { name: bar.series.item.name, value: formatValue(bar.value) })"
          @click="open(bar.series.item)"
        >
          <span class="flex items-baseline gap-1.5">
            <img
              v-if="bar.series.item.icon"
              :src="bar.series.item.icon"
              alt=""
              width="16"
              height="16"
              loading="lazy"
              class="size-4 shrink-0 object-contain"
            >
            <span class="min-w-0 flex-1 truncate text-[11.5px] text-[var(--sz-text)]">{{ bar.series.item.name }}</span>
            <RankBadge v-if="bar.series.item.rank" :rank="bar.series.item.rank" />
            <span class="shrink-0 tabular-nums text-[11px] text-[var(--sz-text)]">{{ formatValue(bar.value) }}</span>
            <span v-if="bar.best" class="sz-caps shrink-0 text-[9px] text-[var(--sz-success-text)]">
              {{ t('chat.chart.best') }}
            </span>
          </span>
          <span class="mt-0.5 block h-1.5 bg-[var(--sz-border)]">
            <span
              class="block h-full transition-[width] duration-200"
              :class="bar.best ? 'bg-[var(--sz-accent)]' : 'bg-[var(--sz-border-strong)] group-hover:bg-[var(--sz-accent)]/70'"
              :style="{ width: `${Math.max(2, Math.round(bar.ratio * 100))}%` }"
            />
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>
