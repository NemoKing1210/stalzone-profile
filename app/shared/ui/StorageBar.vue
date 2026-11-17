<script setup lang="ts">
import { clampPercent } from '~/shared/lib/clampPercent';

const props = withDefaults(
  defineProps<{
    label: string;
    value: number;
    max: number;
    unit?: string;
    tone?: 'neutral' | 'success' | 'danger' | 'warning';
  }>(),
  { unit: undefined, tone: 'neutral' },
);

const percent = computed(() => clampPercent(props.value, props.max));
const color = computed(
  () =>
    ({
      neutral: 'var(--sz-accent)',
      success: 'var(--sz-success)',
      danger: 'var(--sz-danger)',
      warning: 'var(--sz-warning)',
    })[props.tone],
);
</script>

<template>
  <div class="min-w-0">
    <div class="flex items-baseline justify-between gap-2 text-[11px] text-[var(--sz-text-muted)]">
      <span class="sz-caps truncate">{{ label }}</span>
      <span class="shrink-0 tabular-nums">
        {{ value }} / {{ max }}<span v-if="unit"> {{ unit }}</span>
      </span>
    </div>
    <div class="mt-1 h-[3px] w-full bg-ink-950">
      <div class="h-full" :style="{ width: `${percent}%`, backgroundColor: color }" />
    </div>
  </div>
</template>
