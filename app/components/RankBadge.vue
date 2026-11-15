<script setup lang="ts">
import { RANK_COLOR, rankKey } from '@dossier/shared/ranks';

const props = defineProps<{ rank?: string | null; size?: 'sm' | 'md' | 'lg' }>();
const { t } = useI18n();

const key = computed(() => rankKey(props.rank));
const color = computed(() => (key.value ? RANK_COLOR[key.value] : RANK_COLOR.default));
const label = computed(() => (key.value ? t(`ranks.${key.value}`) : (props.rank ?? '—')));
</script>

<template>
  <UBadge
    variant="subtle"
    :size="props.size ?? 'sm'"
    :style="{ backgroundColor: `${color}22`, color }"
    class="font-medium"
  >
    {{ label }}
  </UBadge>
</template>
