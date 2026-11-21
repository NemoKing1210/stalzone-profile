<script setup lang="ts">
import { ProfileItemCard } from '~/entities/item';

import type { ModificationRow } from '../../model/kinds/modifications';

const props = defineProps<{ row: ModificationRow; priority: boolean }>();
defineEmits<{ open: [] }>();

const { t } = useI18n();

const slotLabel = computed(() => t(`inventory.modification.${props.row.slot}`));
</script>

<template>
  <ProfileItemCard
    :name="row.name"
    :rank="row.rank"
    :category="slotLabel"
    :icon="row.icon"
    :virtual="row.virtual"
    :weight="row.weight"
    :priority="priority"
    @open="$emit('open')"
  />
</template>
