<script setup lang="ts">
import { DossierItemCard } from '~/entities/item';

import type { ContainerRow } from '../../model/kinds/containers';

const props = defineProps<{ row: ContainerRow; selected: boolean; priority: boolean }>();
defineEmits<{ select: [] }>();

const { t } = useI18n();
const { g2, num } = useFormat();

const stats = computed(() => [
  { label: t('table.slots'), value: props.row.slots == null ? '—' : num(props.row.slots) },
  { label: t('table.fill'), value: `${props.row.fill} / ${props.row.slots ?? '—'}` },
  { label: t('table.weight'), value: props.row.weight == null ? '—' : g2(props.row.weight) },
]);
</script>

<template>
  <DossierItemCard
    :name="row.name"
    :rank="row.rank"
    :category="row.type"
    :icon="row.icon"
    :description="row.bonus ?? undefined"
    :stats="stats"
    :selected="selected"
    :priority="priority"
    @select="$emit('select')"
  />
</template>
