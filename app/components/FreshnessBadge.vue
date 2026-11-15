<script setup lang="ts">
const props = defineProps<{ dataUpdated?: string | null; pricesAgeMin?: number | null }>();

const { formatAge, formatDate } = useFormat();
const { t } = useI18n();

const color = computed(() => {
  const age = props.pricesAgeMin;
  if (age == null) return 'neutral';
  if (age < 180) return 'success';
  if (age < 60 * 24) return 'warning';
  return 'error';
});

const label = computed(() => t('freshness.prices', { age: formatAge(props.pricesAgeMin) }));
const tooltip = computed(() => t('freshness.data', { date: formatDate(props.dataUpdated) }));
</script>

<template>
  <UTooltip :text="tooltip">
    <UBadge :color="color" variant="subtle" icon="i-lucide-clock" class="whitespace-nowrap">
      {{ label }}
    </UBadge>
  </UTooltip>
</template>
