<script setup lang="ts">
import { ProfileItemCard } from '~/entities/item';

import type { DeviceRow } from '../../model/kinds/devices';

const props = defineProps<{ row: DeviceRow; selected: boolean; priority: boolean }>();
defineEmits<{ select: [] }>();

const { t } = useI18n();
const { g2 } = useFormat();

const stats = computed(() => [
  { label: t('table.weight'), value: props.row.weight == null ? '—' : g2(props.row.weight) },
  { label: t('table.type'), value: props.row.type ?? '—' },
]);
</script>

<template>
  <ProfileItemCard
    :name="row.name"
    :rank="row.rank"
    :category="row.type"
    :icon="row.icon"
    :stats="stats"
    :selected="selected"
    :priority="priority"
    @select="$emit('select')"
  />
</template>
