<script setup lang="ts">
import { FreshnessBadge } from '~/entities/source';
import { useProfileData } from '~/stores/profile-data';
import { navCounts } from '~/shared/lib/nav';

const props = withDefaults(
  defineProps<{
    collapsed?: boolean;
    mobile?: boolean;
  }>(),
  { collapsed: false, mobile: false },
);

const emit = defineEmits<{
  navigate: [];
  close: [];
  'toggle-collapse': [];
}>();

const { t } = useI18n();
const { meta, payload } = useProfileData();
const { fmtMoney } = useFormat();
const { theme, toggleTheme } = useTheme();

const counts = computed(() => navCounts(payload.value));
const money = computed(() => payload.value?.character?.money ?? null);
const nick = computed(() => payload.value?.character?.nick ?? null);
const loggingOut = ref(false);

interface NavEntry {
  key: string;
  label: string;
  icon: string;
  to: string;
  count?: number | null;
}

const sections = computed<NavEntry[]>(() => [
  { key: 'overview', label: t('nav.overview'), icon: 'i-lucide-house', to: '/' },
  { key: 'inventory', label: t('nav.inventory'), icon: 'i-lucide-package', to: '/inventory' },
  { key: 'weapons', label: t('nav.weapons'), icon: 'i-lucide-crosshair', to: '/weapons', count: counts.value.weapons },
  { key: 'armor', label: t('nav.armor'), icon: 'i-lucide-shield', to: '/armor', count: counts.value.armor },
  {
    key: 'containers',
    label: t('nav.containers'),
    icon: 'i-lucide-backpack',
    to: '/containers',
    count: counts.value.containers,
  },
  {
    key: 'artifacts',
    label: t('nav.artifacts'),
    icon: 'i-lucide-gem',
    to: '/artifacts',
    count: counts.value.artifacts,
  },
  { key: 'changelog', label: t('nav.changelog'), icon: 'i-lucide-scroll-text', to: '/changelog' },
  { key: 'guide', label: t('nav.guide'), icon: 'i-lucide-map', to: '/guide' },
]);

function countLabel(entry: NavEntry): string {
  return entry.count == null ? '' : t('nav.ownedCount', { label: entry.label, count: entry.count });
}

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
  <div class="flex h-full min-h-0 flex-col bg-ink-950 text-[var(--sz-text)]">
    <div class="flex min-h-12 shrink-0 items-center gap-2 border-b border-[var(--sz-border)] px-3">
      <NuxtLink to="/" class="flex min-w-0 items-center gap-1.5 overflow-hidden" @click="emit('navigate')">
        <template v-if="!collapsed || mobile">
          <span class="font-brand text-[17px] leading-none tracking-[0.12em]">{{ t('common.brandLeft') }}</span>
          <span class="hidden text-[17px] leading-none text-[var(--sz-accent)] min-[240px]:inline">//</span>
          <span class="truncate font-brand text-[17px] leading-none tracking-[0.12em]">
            {{ t('common.brandRight') }}
          </span>
        </template>
        <span
          v-else
          class="font-brand text-[17px] leading-none tracking-[0.06em] text-[var(--sz-accent)]"
          :aria-label="`${t('common.brandLeft')} ${t('common.brandRight')}`"
        >
          SZ
        </span>
      </NuxtLink>

      <UButton
        v-if="mobile"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        class="ml-auto"
        :aria-label="t('common.close')"
        @click="emit('close')"
      />
      <UButton
        v-else
        :icon="props.collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
        color="neutral"
        variant="ghost"
        size="xs"
        class="ml-auto"
        :aria-label="props.collapsed ? t('nav.expand') : t('nav.collapse')"
        :aria-expanded="!props.collapsed"
        @click="emit('toggle-collapse')"
      />
    </div>

    <nav class="min-h-0 flex-1 overflow-y-auto py-2" :aria-label="t('nav.sections')">
      <ul class="space-y-0.5 px-1.5">
        <li v-for="entry in sections" :key="entry.key">
          <NuxtLink
            :to="entry.to"
            class="group relative flex min-h-9 items-center gap-2 border-l-2 border-transparent px-2 text-[11px] uppercase tracking-[0.12em] text-[var(--sz-text-muted)] transition-colors hover:bg-ink-900 hover:text-[var(--sz-text)]"
            active-class="border-[var(--sz-accent)] bg-ink-900 text-[var(--sz-text)]"
            :aria-label="countLabel(entry) || entry.label"
            :title="collapsed && !mobile ? entry.label : undefined"
            @click="emit('navigate')"
          >
            <UIcon :name="entry.icon" class="size-4 shrink-0" aria-hidden="true" />
            <span v-if="!collapsed || mobile" class="min-w-0 flex-1 truncate">{{ entry.label }}</span>
            <span
              v-if="entry.count != null"
              class="shrink-0 border border-[var(--sz-border)] px-1 text-[10px] leading-4 tabular-nums text-[var(--sz-text-dim)] group-hover:border-[var(--sz-border-strong)] group-hover:text-[var(--sz-text-muted)]"
              :class="collapsed && !mobile ? 'absolute right-1 top-0.5 border-0 px-0 text-[9px]' : ''"
            >
              {{ entry.count }}
            </span>
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <div class="shrink-0 space-y-2 border-t border-[var(--sz-border)] p-2">
      <div v-if="!collapsed || mobile" class="space-y-1">
        <p v-if="nick" class="truncate px-1 text-[12px] text-[var(--sz-text)]">{{ nick }}</p>
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
          <span
            v-if="money != null"
            class="inline-flex items-center gap-1 whitespace-nowrap text-[11px] tabular-nums text-[var(--sz-money)]"
            :title="t('overview.stats.money')"
          >
            <UIcon name="i-lucide-wallet" class="size-3.5" aria-hidden="true" />
            {{ fmtMoney(money) }}
          </span>
          <FreshnessBadge
            :data-updated="meta?.freshness?.dataUpdated"
            :prices-age-min="meta?.freshness?.pricesAgeMin"
          />
        </div>
        <div class="flex items-center justify-between gap-1 px-1 pt-1">
          <LocaleSwitcher />
          <span class="text-[10px] uppercase tracking-[0.12em] text-[var(--sz-text-dim)]">{{ t('nav.account') }}</span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-1" :class="collapsed && !mobile ? 'grid-cols-1' : ''">
        <UButton
          :icon="theme === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
          color="neutral"
          variant="ghost"
          size="xs"
          block
          :aria-label="t('settings.themeTitle')"
          :title="t('settings.themeTitle')"
          @click="toggleTheme"
        />
        <UButton
          to="/settings"
          icon="i-lucide-settings"
          color="neutral"
          variant="ghost"
          size="xs"
          block
          :aria-label="t('nav.settings')"
          :title="t('nav.settings')"
          @click="emit('navigate')"
        />
        <UButton
          to="/logs"
          icon="i-lucide-bug"
          color="neutral"
          variant="ghost"
          size="xs"
          block
          :aria-label="t('nav.logs')"
          :title="t('nav.logs')"
          @click="emit('navigate')"
        />
        <UButton
          icon="i-lucide-log-out"
          color="neutral"
          variant="ghost"
          size="xs"
          block
          :aria-label="t('nav.logout')"
          :title="t('nav.logout')"
          :loading="loggingOut"
          @click="logout"
        />
      </div>
    </div>
  </div>
</template>
