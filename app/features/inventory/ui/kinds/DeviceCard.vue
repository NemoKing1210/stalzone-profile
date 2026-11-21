<script setup lang="ts">
import { ProfileItemCard } from '~/entities/item';

import type { DeviceRow } from '../../model/kinds/devices';

const props = defineProps<{ row: DeviceRow; priority: boolean }>();
defineEmits<{ open: [] }>();

const { t } = useI18n();

const stats = computed(() => [
  { label: t('table.type'), value: props.row.type ?? '—' },
]);
</script>

<template>
  <ProfileItemCard
    :name="row.name"
    :rank="row.rank"
    :category="row.type"
    :icon="row.icon"
    :weight="row.weight"
    :stats="stats"
    :priority="priority"
    @open="$emit('open')"
  />
</template>
