<script setup lang="ts">
import type { BarValue } from '../../model/comparisonBars';

const props = defineProps<{ value: string; bar: BarValue }>();
</script>

<template>
  <span class="inline-flex min-w-16 flex-col items-end gap-0.5">
    <span class="tabular-nums">{{ props.value }}</span>
    <span class="h-[2px] w-full bg-[var(--sz-border)]/60" aria-hidden="true">
      <span
        class="block h-full transition-[width] duration-150"
        :style="{ width: `${props.bar.ratio * 100}%`, backgroundColor: props.bar.color }"
      />
    </span>
  </span>
</template>
