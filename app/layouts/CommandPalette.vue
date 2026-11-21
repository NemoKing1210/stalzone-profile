<script setup lang="ts">
import { useAssistantPanelStore } from '~/stores/assistantPanel';
import { useProfileData } from '~/stores/profile-data';
import { navCounts } from '~/shared/lib/nav';
import {
  filterPaletteCommands,
  groupPaletteCommands,
  paletteCommands,
  type PaletteCommand,
} from '~/shared/lib/commands';
import {
  isTextField,
  paletteShortcutEnabled,
  readPaletteShortcut,
  PALETTE_OPEN_ATTRIBUTE,
  type PaletteShortcut,
} from '~/shared/lib/paletteShortcut';
import { MODAL_WIDTH } from '~/shared/lib/modalWidth';
import { ConfirmActionModal } from '~/shared/ui';
import type { SyncResult } from '@profile/shared/contracts';

const { t, locale, setLocale } = useI18n();
const { theme, setTheme } = useTheme();
const { density, setDensity } = useAppearance();
const { payload, refresh } = useProfileData();
const { message: apiMessage } = useApiError();
const toast = useToast();
const route = useRoute();
const assistant = useAssistantPanelStore();

const open = ref(false);
const search = ref('');
const confirmSyncOpen = ref(false);
const syncing = ref(false);
const shortcut = ref<PaletteShortcut>('both');

onMounted(() => {
  try {
    shortcut.value = readPaletteShortcut(window.localStorage);
  } catch {
    shortcut.value = 'both';
  }
});

watch(open, (value) => {
  if (!import.meta.client) return;
  document.body.dataset[PALETTE_OPEN_ATTRIBUTE] = value ? '1' : '0';
  if (!value) search.value = '';
});

onUnmounted(() => {
  if (import.meta.client) document.body.dataset[PALETTE_OPEN_ATTRIBUTE] = '0';
});

/** A focused field keeps its own keys: opening the palette would steal its shortcuts. */
function openPalette(): void {
  if (isTextField(document.activeElement)) return;
  open.value = true;
}

defineShortcuts(
  computed(() => {
    const bindings: Record<string, () => void> = {};
    if (paletteShortcutEnabled(shortcut.value, 'space')) bindings.ctrl_space = openPalette;
    if (paletteShortcutEnabled(shortcut.value, 'k')) {
      bindings.meta_k = openPalette;
      bindings.ctrl_k = openPalette;
    }
    return bindings;
  }),
  // Compare physical key codes: the space bar's `key` is a single space, not "space".
  { layoutIndependent: true },
);

const commands = computed<PaletteCommand[]>(() =>
  paletteCommands({
    t,
    counts: navCounts(payload.value),
    stashes: (payload.value?.inventory.storages ?? [])
      .filter((storage) => storage.kind === 'stash')
      .map((storage) => ({ id: storage.id, name: storage.name, count: storage.items.length })),
    theme: theme.value,
    locale: locale.value === 'ru' ? 'ru' : 'en',
    density: density.value,
  }),
);

const filtered = computed(() => filterPaletteCommands(commands.value, search.value));

const groups = computed(() =>
  groupPaletteCommands(filtered.value, t).map((group) => ({
    id: group.id,
    label: group.label,
    ignoreFilter: true,
    items: group.items.map((command) => ({
      id: command.id,
      label: command.label,
      icon: command.icon,
      suffix: command.count == null ? undefined : String(command.count),
    })),
  })),
);

function selectCommand(item: unknown): void {
  const id = item && typeof item === 'object' && 'id' in item ? String(item.id) : '';
  const command = commands.value.find((entry) => entry.id === id);
  if (command) void execute(command);
}

async function execute(command: PaletteCommand): Promise<void> {
  open.value = false;
  switch (command.action) {
    case 'sync-profile':
      confirmSyncOpen.value = true;
      return;
    case 'toggle-theme':
      setTheme(theme.value === 'dark' ? 'light' : 'dark');
      return;
    case 'toggle-locale':
      await setLocale(locale.value === 'ru' ? 'en' : 'ru');
      return;
    case 'toggle-density':
      setDensity(density.value === 'compact' ? 'comfortable' : 'compact');
      return;
    case 'open-assistant':
      if (route.path !== '/chat') assistant.show();
      return;
    default:
      if (command.to) await navigateTo(command.to);
  }
}

async function confirmSync(): Promise<void> {
  if (syncing.value) return;
  syncing.value = true;
  try {
    const response = await $fetch<{ results: SyncResult[] }>('/api/v1/admin/sync', {
      method: 'POST',
      body: { source: 'profile' },
    });
    const result = response.results.find((entry) => entry.source === 'profile');
    if (result?.status === 'ok') {
      toast.add({ title: t('palette.syncDone'), color: 'success', icon: 'i-lucide-check' });
    } else {
      toast.add({
        title: t('palette.syncFailed'),
        description: apiMessage(result?.error, result?.error || t('palette.syncUnconfigured')),
        color: 'warning',
        icon: 'i-lucide-cloud-off',
      });
    }
    await refresh();
  } catch (error) {
    const data =
      error && typeof error === 'object' && 'data' in error
        ? (error as { data?: { error?: { code?: string; message?: string } } }).data
        : undefined;
    toast.add({
      title: t('palette.syncFailed'),
      description: apiMessage(data?.error?.code, data?.error?.message || t('palette.syncUnconfigured')),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    });
  } finally {
    syncing.value = false;
    confirmSyncOpen.value = false;
  }
}
</script>

<template>
  <div>
  <UModal v-model:open="open" :title="t('palette.title')" :ui="{ content: MODAL_WIDTH.form, body: 'p-0' }">
    <template #body>
      <UCommandPalette
        v-model:search-term="search"
        :groups="groups"
        :placeholder="t('palette.placeholder')"
        class="max-h-[60vh]"
        @update:model-value="selectCommand"
      >
        <template #empty>
          <p class="px-3 py-6 text-center text-[12.5px] text-[var(--sz-text-muted)]">{{ t('palette.empty') }}</p>
        </template>
      </UCommandPalette>
    </template>
  </UModal>

  <ConfirmActionModal
    v-model:open="confirmSyncOpen"
    :title="t('palette.confirmTitle')"
    :description="t('palette.confirmSync')"
    :confirm-label="t('palette.confirmAction')"
    :loading="syncing"
    @confirm="confirmSync"
  />
  </div>
</template>
