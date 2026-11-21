<script setup lang="ts">
import { ProfileItemCard } from '~/entities/item';

import type { ContainerRow } from '../../model/kinds/containers';

const props = defineProps<{ row: ContainerRow; priority: boolean }>();
defineEmits<{ open: [] }>();

const { t } = useI18n();
const { num } = useFormat();

const stats = computed(() => [
  { label: t('table.slots'), value: props.row.slots == null ? '—' : num(props.row.slots) },
  { label: t('table.fill'), value: `${props.row.fill} / ${props.row.slots ?? '—'}` },
]);
</script>

<template>
  <ProfileItemCard
    :name="row.name"
    :rank="row.rank"
    :category="row.type"
    :icon="row.icon"
    :virtual="row.virtual"
    :weight="row.weight"
    :description="row.bonus ?? undefined"
    :stats="stats"
    :priority="priority"
    @open="$emit('open')"
  />
</template>
