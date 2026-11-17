<script setup lang="ts">
const { locale, setLocale, t } = useI18n();

const options = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
] as const;

const items = computed(() =>
  options.map((option) => ({
    label: option.label,
    icon: locale.value === option.code ? 'i-lucide-check' : undefined,
    onSelect: () => setLocale(option.code),
  })),
);
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton icon="i-lucide-languages" color="neutral" variant="ghost" :aria-label="t('common.language')" />
  </UDropdownMenu>
</template>
