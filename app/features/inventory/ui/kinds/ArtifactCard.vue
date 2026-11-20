<script setup lang="ts">
import { ProfileItemCard } from '~/entities/item';

import type { ArtifactRow } from '../../model/kinds/artifacts';

const props = defineProps<{ row: ArtifactRow; priority: boolean }>();
defineEmits<{ open: [] }>();

const stats = computed(() => [
  { label: '', value: props.row.q ?? '—' },
  { label: '', value: `+${props.row.lvl}` },
]);
</script>

<template>
  <ProfileItemCard
    :name="row.name"
    :rank="row.rank"
    :category="row.type"
    :icon="row.icon"
    :description="row.effects ?? undefined"
    :stats="stats"
    :priority="priority"
    @open="$emit('open')"
  />
</template>
