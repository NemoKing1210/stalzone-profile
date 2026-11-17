<script setup lang="ts">
import { RANK_COLOR, rankKey } from '@profile/shared/ranks';

import { rankTextColor } from '~/shared/lib/rankText';

const props = withDefaults(
  defineProps<{
    rank?: string | null;
    size?: 'sm' | 'md' | 'lg';
  }>(),
  { rank: undefined, size: 'sm' },
);

const { t } = useI18n();

const key = computed(() => rankKey(props.rank));
const color = computed(() => (key.value ? RANK_COLOR[key.value] : RANK_COLOR.default));
/** The chip border keeps the exact rank colour; the label takes the text-safe variant. */
const textColor = computed(() => rankTextColor(props.rank));
const label = computed(() => (key.value ? t(`ranks.${key.value}`) : (props.rank ?? '—')));
const sizeClass = computed(() => (props.size === 'lg' ? 'text-[12px]' : 'text-[11px]'));
</script>

<template>
  <span
    class="inline-flex items-center border px-1.5 py-0.5 font-medium leading-none"
    :class="sizeClass"
    :style="{ color: textColor, borderColor: color, backgroundColor: `${color}1f` }"
  >
    {{ label }}
  </span>
</template>
