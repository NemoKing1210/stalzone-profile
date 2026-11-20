<script setup lang="ts">
import type { InventoryItemRead } from '@profile/shared/contracts';

import type { ContainerFilter } from '../../model/containerFilters';
import ContainerFilterBar from './ContainerFilterBar.vue';

const props = defineProps<{
  filter: ContainerFilter;
  items: readonly InventoryItemRead[];
  order: string;
  orders: { label: string; value: string }[];
  busy: boolean;
  /** Intake: the row stays, the tidy controls are disabled with the release hint. */
  overflow?: boolean;
}>();

const emit = defineEmits<{
  update: [filter: ContainerFilter];
  'update:order': [order: string];
  tidy: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="mb-2 flex flex-wrap items-center gap-1.5 border-b border-[var(--sz-border)] pb-2">
    <ContainerFilterBar :filter="filter" :items="items" @update="emit('update', $event)" />
    <div class="ml-auto flex items-center gap-1" :title="overflow ? t('inventory.overflowHint') : undefined">
      <USelect
        :model-value="order"
        :items="orders"
        size="xs"
        class="w-32"
        :aria-label="t('inventory.tidyOrder')"
        :disabled="overflow"
        @update:model-value="emit('update:order', String($event))"
      />
      <UButton
        icon="i-lucide-list-restart"
        size="xs"
        color="neutral"
        variant="outline"
        :label="t('inventory.tidy')"
        :loading="busy"
        :disabled="overflow || !props.items.length || busy"
        @click="emit('tidy')"
      />
    </div>
  </div>
</template>
