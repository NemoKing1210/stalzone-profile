<script setup lang="ts">
defineProps<{
  keys: string[];
  label: string;
}>();
</script>

<template>
  <span class="inline-flex items-center gap-1.5 text-[11px] text-[var(--sz-text-muted)]">
    <kbd
      v-for="key in keys"
      :key="key"
      class="border border-[var(--sz-border-strong)] bg-[var(--sz-surface-alt)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--sz-text-muted)]"
    >{{ key }}</kbd>
    <span>{{ label }}</span>
  </span>
</template>
