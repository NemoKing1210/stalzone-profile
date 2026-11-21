<script setup lang="ts">
const props = defineProps<{ row: { slot: string | null } }>();

const { t } = useI18n();

const label = computed(() =>
  props.row.slot ? t(`inventory.modification.${props.row.slot}`) : '—',
);
</script>

<template>
  <span class="text-[12px] text-[var(--sz-text-muted)]">{{ label }}</span>
</template>
