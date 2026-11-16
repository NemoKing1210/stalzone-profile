<script setup lang="ts">
const props = defineProps<{ price?: number | null; lots?: number | null }>();
const { fmtMoney } = useFormat();
const { t } = useI18n();
</script>

<template>
  <div class="flex items-center justify-end gap-2 tabular-nums">
    <span v-if="props.price == null" class="text-[11px] text-[var(--sz-text-muted)]">{{ t('items.noLot') }}</span>
    <span v-else class="font-medium text-[var(--sz-money)]">{{ fmtMoney(props.price) }}</span>
    <span v-if="props.lots != null" class="text-[11px] text-[var(--sz-text-dim)]">×{{ props.lots }}</span>
  </div>
</template>
