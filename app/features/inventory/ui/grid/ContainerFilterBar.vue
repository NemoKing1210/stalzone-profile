<script setup lang="ts">
import type { InventoryItemRead, RarityTier } from '@profile/shared/contracts';
import { RarityTierSchema } from '@profile/shared/contracts';
import { ALL_RANKS, rankOptions } from '~/entities/item/model/rankOptions';

import {
  containerFilterActive,
  type ContainerFilter,
} from '../../model/containerFilters';

const props = defineProps<{ filter: ContainerFilter; items: readonly InventoryItemRead[] }>();
const emit = defineEmits<{ update: [filter: ContainerFilter] }>();

const { t } = useI18n();

const KINDS = ['weapon', 'armor', 'container', 'artifact', 'attachment', 'ammo', 'other'] as const;

const kindItems = computed(() => [
  { label: t('inventory.filter.allKinds'), value: 'all' },
  ...KINDS.map((kind) => ({ label: t(`inventory.filterKinds.${kind}`), value: kind })),
]);
const rankItems = computed(() => rankOptions(t));
const qualityItems = computed(() => {
  const present = new Set(props.items.map((item) => item.rarityTier).filter((tier): tier is RarityTier => tier != null));
  return [
    { label: t('inventory.filter.allQualities'), value: 'all' },
    ...RarityTierSchema.options
      .filter((tier) => present.has(tier))
      .map((tier) => ({ label: t(`items.rarityTier.${tier}`), value: tier })),
    ...(present.size ? [{ label: t('forms.rarityTierNone'), value: 'none' }] : []),
  ];
});

const active = computed(() => containerFilterActive(props.filter));

function update(patch: Partial<ContainerFilter>): void {
  emit('update', { ...props.filter, ...patch });
}

function reset(): void {
  emit('update', { kind: 'all', rank: ALL_RANKS, quality: 'all' });
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <span class="sz-caps text-[10.5px] text-[var(--sz-text-dim)]">{{ t('inventory.filter.label') }}</span>
    <USelect
      :model-value="filter.kind"
      :items="kindItems"
      size="xs"
      class="w-32"
      :aria-label="t('inventory.filter.kind')"
      @update:model-value="(value) => update({ kind: String(value) })"
    />
    <USelect
      :model-value="filter.rank"
      :items="rankItems"
      size="xs"
      class="w-32"
      :aria-label="t('inventory.filter.rank')"
      @update:model-value="(value) => update({ rank: String(value) })"
    />
    <USelect
      :model-value="filter.quality"
      :items="qualityItems"
      size="xs"
      class="w-32"
      :aria-label="t('inventory.filter.quality')"
      @update:model-value="(value) => update({ quality: String(value) })"
    />
    <UButton
      v-if="active"
      icon="i-lucide-x"
      size="xs"
      color="neutral"
      variant="ghost"
      :label="t('common.reset')"
      @click="reset"
    />
    <span v-if="active" class="text-[11px] text-[var(--sz-warning-text)]">{{ t('inventory.filter.active') }}</span>
  </div>
</template>
