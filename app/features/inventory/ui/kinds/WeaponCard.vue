<script setup lang="ts">
import { ProfileItemCard } from '~/entities/item';

import type { WeaponRow } from '../../model/kinds/weapons';

const props = defineProps<{ row: WeaponRow; selected: boolean; priority: boolean }>();
defineEmits<{ select: [] }>();

const { t } = useI18n();
const { g2, num } = useFormat();

const stats = computed(() => [
  { label: t('table.weight'), value: props.row.weight == null ? '—' : g2(props.row.weight) },
  { label: t('table.caliber'), value: props.row.caliber ?? '—' },
  { label: 'DPS', value: props.row.dps == null ? '—' : num(props.row.dps) },
]);
</script>

<template>
  <ProfileItemCard
    :name="row.name"
    :rank="row.rank"
    :category="row.type"
    :level="row.lvl"
    :icon="row.icon"
    :stats="stats"
    :selected="selected"
    :priority="priority"
    @select="$emit('select')"
  />
</template>
