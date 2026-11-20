<script setup lang="ts">
const { locale, locales } = useI18n();

/**
 * `useLocaleHead()` warns and emits invalid absolute SEO links while `i18n.baseUrl` is
 * unset, and this noindex profile never serves hreflang. Keep the document language,
 * which screen readers need, and drop the rest.
 */
const htmlLang = computed(
  () => locales.value.find((entry) => entry.code === locale.value)?.language ?? locale.value,
);

useHead(() => ({ htmlAttrs: { lang: htmlLang.value } }));

/** Theme and appearance choices load after hydration; the inline script prevents a flash. */
const { toasterProps } = useAppearance();
</script>

<template>
  <UApp :toaster="toasterProps">
    <BootSplash />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
