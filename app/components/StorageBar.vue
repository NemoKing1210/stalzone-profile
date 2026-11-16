<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    label: string;
    value: number;
    max: number;
    unit?: string;
    tone?: 'neutral' | 'success' | 'danger' | 'warning';
  }>(),
  { tone: 'neutral' },
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
    <div class="flex items-baseline justify-between gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--sz-text-muted)]">
      <span class="truncate">{{ label }}</span>
      <span class="shrink-0 tabular-nums text-[var(--sz-text-muted)]">
        {{ value }} / {{ max }}<span v-if="unit"> {{ unit }}</span>
      </span>
    </div>
    <div class="mt-1 h-[3px] w-full bg-ink-950">
      <div class="h-full" :style="{ width: `${percent}%`, backgroundColor: color }" />
    </div>
  </div>
</template>
