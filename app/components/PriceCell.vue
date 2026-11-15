<script setup lang="ts">
const props = defineProps<{ price?: number | null; lots?: number | null }>();
const { fmtMoney } = useFormat();
</script>

<template>
  <div class="flex items-center justify-end gap-2 tabular-nums">
    <span v-if="props.price == null" class="text-xs text-muted">нет лота</span>
    <span v-else class="font-medium">{{ fmtMoney(props.price) }}</span>
    <UBadge v-if="props.lots != null" color="neutral" variant="subtle" size="sm">{{ props.lots }}</UBadge>
  </div>
</template>
