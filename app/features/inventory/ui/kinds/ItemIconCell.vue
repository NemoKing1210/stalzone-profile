<script setup lang="ts">
defineProps<{ icon: string | null }>();
</script>

<template>
  <span class="inline-flex size-12 items-center justify-center border border-[var(--sz-border)] bg-[var(--sz-surface-alt)]">
    <img v-if="icon" :src="icon" alt="" width="44" height="44" loading="lazy" class="size-11 object-contain">
    <span v-else class="text-[var(--sz-text-dim)]">—</span>
  </span>
</template>
