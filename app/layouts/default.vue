<script setup lang="ts">
import SiteNav from './SiteNav.vue';
import { useProfileData } from '~/stores/profile-data';

const { t } = useI18n();
const profile = useProfileData();
// The layout is the SSR boundary for every authenticated page: resolve the payload
// before the child screens render, so the first HTML already carries their rows.
if (import.meta.server) await profile.refresh();
const route = useRoute();

/** Desktop rail width; the drawer reuses the same panel on narrow screens. */
const COLLAPSED_WIDTH = '4rem';
const EXPANDED_WIDTH = '15rem';
const NAV_STORAGE_KEY = 'profile.nav-collapsed';

const collapsed = ref(false);
const mobileOpen = ref(false);

onMounted(() => {
  try {
    collapsed.value = localStorage.getItem(NAV_STORAGE_KEY) === '1';
  } catch {
    /* storage unavailable: keep the rail expanded */
  }
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});

watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false;
  },
);

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && mobileOpen.value) mobileOpen.value = false;
}

function toggleCollapse(): void {
  collapsed.value = !collapsed.value;
  try {
    localStorage.setItem(NAV_STORAGE_KEY, collapsed.value ? '1' : '0');
  } catch {
    /* the choice still applies for this page */
  }
}

const sideWidth = computed(() => (collapsed.value ? COLLAPSED_WIDTH : EXPANDED_WIDTH));
</script>

<template>
  <div class="sz-atmosphere min-h-screen text-[var(--sz-text)]">
    <aside
      class="fixed inset-y-0 left-0 z-40 hidden border-r border-[var(--sz-border)] lg:block"
      :style="{ width: sideWidth }"
    >
      <SiteNav
        :collapsed="collapsed"
        @toggle-collapse="toggleCollapse"
      />
    </aside>

    <header
      class="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-[var(--sz-border)] bg-ink-950 px-4 lg:hidden"
    >
      <UButton
        icon="i-lucide-menu"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="t('nav.openMenu')"
        :aria-expanded="mobileOpen"
        @click="mobileOpen = true"
      />
      <NuxtLink to="/" class="flex min-w-0 items-center gap-1.5">
        <span class="font-brand text-[17px] leading-none tracking-[0.12em]">{{ t('common.brandLeft') }}</span>
        <span class="text-[17px] leading-none text-[var(--sz-accent)]">//</span>
        <span class="font-brand text-[17px] leading-none tracking-[0.12em]">{{ t('common.brandRight') }}</span>
      </NuxtLink>
    </header>

    <div
      v-if="mobileOpen"
      class="fixed inset-0 z-50 lg:hidden"
      role="dialog"
      aria-modal="true"
      :aria-label="t('nav.sections')"
    >
      <button
        type="button"
        class="absolute inset-0 bg-ink-950/75"
        :aria-label="t('common.close')"
        @click="mobileOpen = false"
      />
      <div class="absolute inset-y-0 left-0 w-[min(86vw,18rem)] border-r border-[var(--sz-border)] shadow-2xl">
        <SiteNav mobile @navigate="mobileOpen = false" @close="mobileOpen = false" />
      </div>
    </div>

    <div
      class="min-h-screen transition-[padding] duration-150 lg:pl-[var(--sz-side-width)]"
      :style="{ '--sz-side-width': sideWidth }"
    >
      <main class="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6">
        <slot />
      </main>
    </div>

    <ZoneRadio />
  </div>
</template>
