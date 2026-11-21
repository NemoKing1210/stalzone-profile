<script setup lang="ts">
import { ProfileItemCard } from '~/entities/item';

import type { ArmorRow } from '../../model/kinds/armor';

const props = defineProps<{ row: ArmorRow; priority: boolean }>();
defineEmits<{ open: [] }>();

const { t } = useI18n();
const { g1 } = useFormat();

const stats = computed(() => [
  { label: t('table.armor'), value: props.row.armor == null ? '—' : g1(props.row.armor) },
  { label: t('table.armor15'), value: props.row.armor15 == null ? '—' : g1(props.row.armor15) },
]);
</script>

<template>
  <ProfileItemCard
    :name="row.name"
    :rank="row.rank"
    :category="row.cls"
    :level="row.lvl"
    :icon="row.icon"
    :virtual="row.virtual"
    :weight="row.weight"
    :stats="stats"
    :priority="priority"
    @open="$emit('open')"
  />
</template>
