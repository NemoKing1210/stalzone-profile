<script setup lang="ts">
import { ProfileItemCard } from '~/entities/item';

import type { ArmorRow } from '../../model/kinds/armor';

const props = defineProps<{ row: ArmorRow; selected: boolean; priority: boolean }>();
defineEmits<{ select: [] }>();

const { t } = useI18n();
const { g1, g2 } = useFormat();

const stats = computed(() => [
  { label: t('table.armor'), value: props.row.armor == null ? '—' : g1(props.row.armor) },
  { label: '+15', value: props.row.armor15 == null ? '—' : g1(props.row.armor15) },
  { label: t('table.weight'), value: props.row.weight == null ? '—' : g2(props.row.weight) },
]);
</script>

<template>
  <ProfileItemCard
    :name="row.name"
    :rank="row.rank"
    :category="row.cls"
    :level="row.lvl"
    :icon="row.icon"
    :stats="stats"
    :selected="selected"
    :priority="priority"
    @select="$emit('select')"
  />
</template>
