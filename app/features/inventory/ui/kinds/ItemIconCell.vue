<script setup lang="ts">
import { itemEdgeColor } from '~/shared/lib/rankBorder';
import { ItemIconFallback, VirtualBadge } from '~/entities/item';

defineProps<{ icon: string | null; rank: string | null; virtual?: boolean }>();
</script>

<template>
  <span
    class="sz-hatch sz-hatch--fine relative inline-flex size-16 items-center justify-center border bg-[var(--sz-surface-alt)]"
    :style="{ borderColor: itemEdgeColor(rank) }"
  >
    <img v-if="icon" :src="icon" alt="" width="60" height="60" loading="lazy" class="size-15 object-contain">
    <ItemIconFallback v-else :size="36" />
    <VirtualBadge v-if="virtual" class="absolute -bottom-1 -right-1" />
  </span>
</template>
