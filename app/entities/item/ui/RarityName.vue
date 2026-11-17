<script setup lang="ts">
import { rankTextColor } from '~/shared/lib/rankText';

const props = withDefaults(
  defineProps<{
    name: string;
    rank?: string | null;
    level?: number | null;
    size?: 'sm' | 'md' | 'lg';
  }>(),
  { size: 'md' },
);

const sizeClass = computed(
  () =>
    ({
      sm: 'text-[12.5px]',
      md: 'text-[14px]',
      lg: 'text-[17px]',
    })[props.size],
);
const color = computed(() => rankTextColor(props.rank));
</script>

<template>
  <span class="font-medium leading-snug" :class="sizeClass" :style="{ color }">
    <span>{{ name }}</span><span v-if="level != null" class="ml-1 tabular-nums text-[var(--sz-success-text)]">+{{ level }}</span>
  </span>
</template>
