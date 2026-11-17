<script setup lang="ts">
const { t } = useI18n();

const sections = computed(() => [
  { label: t('nav.overview'), icon: 'i-lucide-house', to: '/' },
  { label: t('nav.weapons'), icon: 'i-lucide-crosshair', to: '/weapons' },
  { label: t('nav.armor'), icon: 'i-lucide-shield', to: '/armor' },
  { label: t('nav.containers'), icon: 'i-lucide-backpack', to: '/containers' },
  { label: t('nav.artifacts'), icon: 'i-lucide-gem', to: '/artifacts' },
]);

const navItems = computed(() =>
  sections.value.map((section) => ({
    label: section.label,
    icon: section.icon,
    to: section.to,
  })),
);

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
  <div class="flex min-h-screen flex-col bg-[var(--sz-bg)] text-[var(--sz-text)]">
    <header class="sticky top-0 z-40 border-b border-[var(--sz-border)] bg-ink-950">
      <div
        class="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 px-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,max-content)_minmax(0,1fr)]"
      >
        <NuxtLink to="/" class="flex h-12 shrink-0 items-center gap-1.5 lg:justify-self-start">
          <span class="font-brand text-[17px] leading-none tracking-[0.12em]">{{ t('common.brandLeft') }}</span>
          <span class="hidden text-[17px] leading-none text-[var(--sz-accent)] sm:inline">//</span>
          <span class="hidden font-brand text-[17px] leading-none tracking-[0.12em] sm:inline">{{ t('common.brandRight') }}</span>
        </NuxtLink>

        <div class="sz-nav order-3 w-full min-w-0 overflow-x-auto lg:order-none lg:w-auto lg:justify-self-center">
          <UNavigationMenu
            :items="navItems"
            orientation="horizontal"
            class="min-w-max"
            :ui="{
              list: 'h-full gap-0',
              item: 'py-0',
              link: 'gap-1 rounded-none px-2 py-0 text-[var(--sz-text-muted)] hover:text-[var(--sz-text)]',
              linkLeadingIcon: 'size-4',
            }"
          />
        </div>

        <div class="ml-auto flex items-center gap-1 lg:ml-0 lg:justify-self-end">
          <FreshnessBadge
            :data-updated="meta?.freshness?.dataUpdated"
            :prices-age-min="meta?.freshness?.pricesAgeMin"
          />
          <LocaleSwitcher />
          <UButton
            :to="'/settings'"
            icon="i-lucide-settings"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('nav.settings')"
          />
          <UButton
            icon="i-lucide-log-out"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('nav.logout')"
            :loading="loggingOut"
            @click="logout"
          />
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4 sm:px-6">
      <slot />
    </main>

    <footer class="border-t border-[var(--sz-border)] px-4 py-2 text-[11px] text-[var(--sz-text-dim)] sm:px-6">
      {{ t('nav.footer') }}
      <span class="sr-only">{{ t('nav.currentSection', { path: route.path }) }}</span>
    </footer>
  </div>
</template>
