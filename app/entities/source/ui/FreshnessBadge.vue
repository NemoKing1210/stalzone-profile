<script setup lang="ts">
const props = defineProps<{ dataUpdated?: string | null; pricesAgeMin?: number | null }>();

const { formatAge, formatDate } = useFormat();
const { t } = useI18n();

const toneClass = computed(() => {
  const age = props.pricesAgeMin;
  if (age == null) return 'text-[var(--sz-text-muted)]';
  if (age < 180) return 'text-[var(--sz-success-text)]';
  if (age < 60 * 24) return 'text-[var(--sz-warning-text)]';
  return 'text-[var(--sz-danger-text)]';
});

const label = computed(() => t('freshness.prices', { age: formatAge(props.pricesAgeMin) }));
const tooltip = computed(() => t('freshness.data', { date: formatDate(props.dataUpdated) }));
</script>

<template>
  <UTooltip :text="tooltip">
    <span
      data-testid="freshness"
      class="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px]"
      :class="toneClass"
    >
      <span class="size-1.5 rounded-full bg-current" />
      {{ label }}
    </span>
  </UTooltip>
</template>
