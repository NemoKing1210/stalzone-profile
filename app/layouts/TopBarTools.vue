<script setup lang="ts">
const { t } = useI18n();
const { theme, toggleTheme } = useTheme();
const themeLabel = computed(() => (theme.value === 'dark' ? t('palette.themeLight') : t('palette.themeDark')));
</script>

<template>
  <div class="flex items-center gap-1">
    <LocaleSwitcher />
    <button
      type="button"
      class="inline-flex size-8 items-center justify-center border border-transparent text-[var(--sz-text-muted)] transition-colors hover:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sz-accent)]"
      :aria-label="themeLabel"
      :title="themeLabel"
      @click="toggleTheme"
    >
      <UIcon :name="theme === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-4" aria-hidden="true" />
    </button>
  </div>
</template>
