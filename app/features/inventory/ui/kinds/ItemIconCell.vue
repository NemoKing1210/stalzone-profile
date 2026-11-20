<script setup lang="ts">
defineProps<{ icon: string | null }>();
</script>

<template>
  <span class="inline-flex size-6 items-center justify-center">
    <img v-if="icon" :src="icon" alt="" width="22" height="22" loading="lazy" class="size-[22px] object-contain">
    <span v-else class="text-[var(--sz-text-dim)]">—</span>
  </span>
</template>
