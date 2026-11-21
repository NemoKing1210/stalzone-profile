<script setup lang="ts">
import { FreshnessBadge } from '~/entities/source';
import { useProfileData } from '~/stores/profile-data';
import { navCounts } from '~/shared/lib/nav';
import { factionEmblem, factionLabel } from '~/shared/lib/factions';

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

const counts = computed(() => navCounts(payload.value));
const money = computed(() => payload.value?.character?.money ?? null);
const nick = computed(() => payload.value?.character?.nick ?? null);
const character = computed(() => payload.value?.character ?? {});
const factionName = computed(() => factionLabel(t, character.value.faction));
const factionEmblemImg = computed(() => factionEmblem(character.value.faction));
const loggingOut = ref(false);
/** The 64 px icon rail: no labels, no brand, only icons. */
const rail = computed(() => props.collapsed && !props.mobile);

interface NavEntry {
  key: string;
  label: string;
  icon: string;
  to: string;
  count?: number | null;
}

const sections = computed<NavEntry[]>(() => [
  { key: 'overview', label: t('nav.overview'), icon: 'i-lucide-house', to: '/' },
  { key: 'chat', label: t('nav.chat'), icon: 'i-lucide-message-circle', to: '/chat' },
  { key: 'inventory', label: t('nav.inventory'), icon: 'i-lucide-package', to: '/inventory', count: counts.value.inventory },
  { key: 'weapons', label: t('nav.weapons'), icon: 'i-lucide-crosshair', to: '/weapons', count: counts.value.weapons },
  {
    key: 'modifications',
    label: t('nav.modifications'),
    icon: 'i-lucide-wrench',
    to: '/modifications',
    count: counts.value.modifications,
  },
  { key: 'devices', label: t('nav.devices'), icon: 'i-lucide-radar', to: '/devices', count: counts.value.devices },
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
      <NuxtLink v-if="!rail" to="/" class="flex min-w-0 items-center gap-1.5 overflow-hidden" @click="emit('navigate')">
        <span class="font-brand text-[17px] leading-none tracking-[0.12em]">{{ t('common.brandLeft') }}</span>
        <span class="hidden text-[17px] leading-none text-[var(--sz-accent)] min-[240px]:inline">//</span>
        <span class="truncate font-brand text-[17px] leading-none tracking-[0.12em]">
          {{ t('common.brandRight') }}
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
        :class="rail ? 'mx-auto' : 'ml-auto'"
        :aria-label="props.collapsed ? t('nav.expand') : t('nav.collapse')"
        :aria-expanded="!props.collapsed"
        @click="emit('toggle-collapse')"
      />
    </div>

    <nav class="min-h-0 flex-1 overflow-y-auto py-2" :aria-label="t('nav.sections')">
      <ul>
        <li v-for="entry in sections" :key="entry.key">
          <NuxtLink
            :to="entry.to"
            class="group relative flex min-h-9 items-center border-l-2 border-transparent text-[11px] uppercase tracking-[0.12em] text-[var(--sz-text-muted)] transition-colors hover:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-text)]"
            :class="rail ? 'justify-center px-0' : 'gap-2 px-2'"
            active-class="border-[var(--sz-accent)] bg-[var(--sz-surface-alt)] text-[var(--sz-text)]"
            :aria-label="countLabel(entry) || entry.label"
            :title="rail ? entry.label : undefined"
            @click="emit('navigate')"
          >
            <span class="relative flex size-4 shrink-0 items-center justify-center">
              <UIcon :name="entry.icon" class="size-4" aria-hidden="true" />
              <span
                v-if="rail && entry.count != null"
                class="absolute -right-2.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-[3px] text-[9px] leading-4 tabular-nums text-[var(--sz-text-muted)]"
              >
                {{ entry.count }}
              </span>
            </span>
            <span
              class="min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-[cubic-bezier(.2,.8,.2,1)]"
              :class="rail ? 'max-w-0 opacity-0' : 'max-w-[10rem] flex-1 opacity-100'"
            >
              {{ entry.label }}
            </span>
            <span
              v-if="!rail && entry.count != null"
              class="shrink-0 border border-[var(--sz-border)] px-1 text-[10px] leading-4 tabular-nums text-[var(--sz-text-dim)] transition-colors group-hover:border-[var(--sz-border-strong)] group-hover:text-[var(--sz-text-muted)]"
            >
              {{ entry.count }}
            </span>
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <div class="shrink-0 space-y-2 border-t border-[var(--sz-border)] p-2">
      <div v-if="!rail" class="space-y-1">
        <div v-if="nick" class="flex min-w-0 items-center gap-1.5 px-1">
          <p class="min-w-0 flex-1 truncate text-[12px] text-[var(--sz-text)]">{{ nick }}</p>
          <span v-if="factionName" class="flex shrink-0 items-center gap-1" :title="factionName">
            <img v-if="factionEmblemImg" :src="factionEmblemImg.src" alt="" width="14" height="14" class="size-3.5 object-contain">
            <span class="sz-caps text-[10px] text-[var(--sz-text-dim)]">{{ factionName }}</span>
          </span>
        </div>
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
        <p class="px-1 pt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--sz-text-dim)]">{{ t('nav.account') }}</p>
      </div>

      <ul>
        <li>
          <NuxtLink
            to="/settings"
            class="group relative flex min-h-9 items-center border-l-2 border-transparent text-[11px] uppercase tracking-[0.12em] text-[var(--sz-text-muted)] transition-colors hover:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-text)]"
            :class="rail ? 'justify-center px-0' : 'gap-2 px-2'"
            active-class="border-[var(--sz-accent)] bg-[var(--sz-surface-alt)] text-[var(--sz-text)]"
            :aria-label="t('nav.settings')"
            :title="rail ? t('nav.settings') : undefined"
            @click="emit('navigate')"
          >
            <UIcon name="i-lucide-settings" class="size-4 shrink-0" aria-hidden="true" />
            <span
              class="min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-[cubic-bezier(.2,.8,.2,1)]"
              :class="rail ? 'max-w-0 opacity-0' : 'max-w-[10rem] flex-1 opacity-100'"
            >
              {{ t('nav.settings') }}
            </span>
          </NuxtLink>
        </li>
        <li>
          <NuxtLink
            to="/logs"
            class="group relative flex min-h-9 items-center border-l-2 border-transparent text-[11px] uppercase tracking-[0.12em] text-[var(--sz-text-muted)] transition-colors hover:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-text)]"
            :class="rail ? 'justify-center px-0' : 'gap-2 px-2'"
            active-class="border-[var(--sz-accent)] bg-[var(--sz-surface-alt)] text-[var(--sz-text)]"
            :aria-label="t('nav.logs')"
            :title="rail ? t('nav.logs') : undefined"
            @click="emit('navigate')"
          >
            <UIcon name="i-lucide-bug" class="size-4 shrink-0" aria-hidden="true" />
            <span
              class="min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-[cubic-bezier(.2,.8,.2,1)]"
              :class="rail ? 'max-w-0 opacity-0' : 'max-w-[10rem] flex-1 opacity-100'"
            >
              {{ t('nav.logs') }}
            </span>
          </NuxtLink>
        </li>
        <li>
          <button
            type="button"
            class="group relative flex min-h-9 w-full items-center border-l-2 border-transparent text-[11px] uppercase tracking-[0.12em] text-[var(--sz-text-muted)] transition-colors hover:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-text)] disabled:opacity-60"
            :class="rail ? 'justify-center px-0' : 'gap-2 px-2'"
            :aria-label="t('nav.logout')"
            :title="rail ? t('nav.logout') : undefined"
            :disabled="loggingOut"
            @click="logout"
          >
            <UIcon name="i-lucide-log-out" class="size-4 shrink-0" aria-hidden="true" />
            <span
              class="min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-[cubic-bezier(.2,.8,.2,1)]"
              :class="rail ? 'max-w-0 opacity-0' : 'max-w-[10rem] flex-1 opacity-100'"
            >
              {{ t('nav.logout') }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
