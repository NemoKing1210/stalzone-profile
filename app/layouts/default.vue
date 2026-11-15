<script setup lang="ts">
const sections = [
  { label: 'Обзор', icon: 'i-lucide-house', to: '/' },
  { label: 'Оружие', icon: 'i-lucide-crosshair', to: '/weapons' },
  { label: 'Броня', icon: 'i-lucide-shield', to: '/armor' },
  { label: 'Контейнеры', icon: 'i-lucide-backpack', to: '/containers' },
  { label: 'Артефакты', icon: 'i-lucide-gem', to: '/artifacts' },
  { label: 'Сборки', icon: 'i-lucide-layers', to: '/builds' },
  { label: 'Рекомендации', icon: 'i-lucide-lightbulb', to: '/recommendations' },
  { label: 'Заработок', icon: 'i-lucide-coins', to: '/earnings' },
  { label: 'Заметки', icon: 'i-lucide-notebook-pen', to: '/notes' },
];

const navItems = sections.map((section) => ({
  label: section.label,
  icon: section.icon,
  to: section.to,
}));

const route = useRoute();
const { meta } = useDossier();
const loggingOut = ref(false);

async function logout(): Promise<void> {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    await $fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    /* the cookie may already be gone; leave for /login either way */
  } finally {
    loggingOut.value = false;
    await navigateTo('/login', { external: true });
  }
}
</script>

<template>
  <div class="min-h-screen bg-default text-default">
    <header class="sticky top-0 z-40 border-b border-default bg-default/90 backdrop-blur">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <NuxtLink to="/" class="flex items-center gap-2 font-semibold">
          <UIcon name="i-lucide-folder-search" class="size-6 text-primary" />
          <span class="hidden sm:inline">STALZONE Dossier</span>
        </NuxtLink>

        <div class="order-3 w-full min-w-0 overflow-x-auto sm:order-none sm:w-auto sm:flex-1">
          <UNavigationMenu
            :items="navItems"
            orientation="horizontal"
            class="min-w-max"
            :ui="{ list: 'gap-0.5' }"
          />
        </div>

        <div class="ml-auto flex items-center gap-2">
          <FreshnessBadge
            :data-updated="meta?.freshness?.dataUpdated"
            :prices-age-min="meta?.freshness?.pricesAgeMin"
          />
          <UButton
            :to="'/settings'"
            icon="i-lucide-settings"
            color="neutral"
            variant="ghost"
            aria-label="Настройки"
          />
          <UButton
            icon="i-lucide-log-out"
            color="neutral"
            variant="ghost"
            aria-label="Выйти"
            :loading="loggingOut"
            @click="logout"
          />
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <slot />
    </main>

    <footer class="border-t border-default py-4 text-center text-xs text-muted">
      Личное досье STALZONE. Данные обновляются вручную, цены — только чтение.
      <span class="sr-only">Текущий раздел: {{ route.path }}</span>
    </footer>
  </div>
</template>
