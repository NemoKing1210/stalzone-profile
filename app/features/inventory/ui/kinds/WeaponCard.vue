<script setup lang="ts">
import { ProfileItemCard } from '~/entities/item';

import type { WeaponRow } from '../../model/kinds/weapons';

const props = defineProps<{ row: WeaponRow; selected: boolean; priority: boolean }>();
defineEmits<{ select: [] }>();

const { t } = useI18n();
const { g1, g2, num } = useFormat();

const stats = computed(() => [
  { label: t('table.weight'), value: props.row.weight == null ? '—' : g2(props.row.weight) },
  { label: t('table.caliber'), value: props.row.caliber ?? '—' },
  { label: t('table.damage'), value: props.row.dmg == null ? '—' : g1(props.row.dmg) },
  { label: t('table.damage15'), value: props.row.dmg15 == null ? '—' : g1(props.row.dmg15) },
  { label: 'DPS', value: props.row.dps == null ? '—' : num(props.row.dps) },
  { label: 'DPS +15', value: props.row.dps15 == null ? '—' : num(props.row.dps15) },
  { label: 'TTK', value: props.row.ttk == null ? '—' : g2(props.row.ttk) },
  { label: 'TTK +15', value: props.row.ttk15 == null ? '—' : g2(props.row.ttk15) },
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
