<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    value: number | null | undefined;
    min?: number;
    max?: number;
    label?: string | null;
    suffix?: string;
  }>(),
  { min: 0, max: 100, label: null, suffix: '' },
);

const pct = computed(() => {
  if (props.value == null || props.max <= props.min) return 0;
  return Math.max(0, Math.min(100, ((props.value - props.min) / (props.max - props.min)) * 100));
});
</script>

<template>
  <div class="space-y-1">
    <div v-if="props.label" class="flex items-center justify-between text-xs text-muted">
      <span>{{ props.label }}</span>
      <span class="tabular-nums">{{ props.value == null ? '—' : `${props.value}${props.suffix}` }}</span>
    </div>
    <UProgress :model-value="pct" size="xs" />
  </div>
</template>
