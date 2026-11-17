<script setup lang="ts">
import { RankBadge } from '~/entities/item';

defineProps<{ row: { rank: string | null } }>();
</script>

<template>
  <RankBadge :rank="row.rank" />
</template>
