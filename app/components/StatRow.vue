<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    label: string;
    value: string | number | null;
    tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'money';
    suffix?: string;
    hint?: string;
    bar?: { value: number; max: number };
  }>(),
  { tone: 'neutral' },
);

const { t } = useI18n();

const missing = computed(() => props.value == null || props.value === '');
const text = computed(() => (missing.value ? '—' : `${props.value}${props.suffix ?? ''}`));
const toneClass = computed(() => {
  if (missing.value) return 'text-[var(--sz-text-dim)]';
  return {
    neutral: 'text-[var(--sz-text)]',
    success: 'text-[var(--sz-success-text)]',
    danger: 'text-[var(--sz-danger-text)]',
    warning: 'text-[var(--sz-warning-text)]',
    money: 'text-[var(--sz-money)]',
  }[props.tone];
});
const width = computed(() => (props.bar ? `${clampPercent(props.bar.value, props.bar.max)}%` : '0%'));
</script>

<template>
  <div class="min-w-0">
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1 text-[12.5px]">
      <span class="min-w-0 break-words text-[var(--sz-text-muted)]">{{ label }}</span>
      <span
        class="ml-auto shrink-0 tabular-nums"
        :class="toneClass"
        :title="missing ? t('common.noData') : hint"
      >{{ text }}</span>
    </div>
    <div v-if="bar" class="h-[3px] w-full bg-ink-950">
      <div class="h-full bg-[var(--sz-accent)]" :style="{ width }" />
    </div>
  </div>
</template>
