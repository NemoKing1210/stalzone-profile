<script setup lang="ts">
import { useQuery } from '@pinia/colada';
import type { LoggingSettings, LoggingSettingsUpdate } from '@profile/shared/contracts';
import { ProfilePane } from '~/shared/ui';
import { QUERY_KEYS } from '~/stores/keys';

const { t } = useI18n();
const { write, busy } = useWrite();

const request = useRequestFetch();
const { data, refetch: refresh } = useQuery({
  key: QUERY_KEYS.logConfig,
  query: () => request<LoggingSettings>('/api/v1/admin/logging'),
});

const enabled = ref(true);
const minLevel = ref<LoggingSettings['minLevel']>('info');
const retentionDays = ref('14');
const maxRows = ref('200000');
const captureClient = ref(true);
const clientConsole = ref(false);
const mirrorStdout = ref(true);
const overrides = ref<Record<string, 'debug' | 'info' | 'warn' | 'error' | 'off' | 'inherit'>>({
  http: 'inherit',
  sync: 'inherit',
  mcp: 'inherit',
  db: 'inherit',
  app: 'inherit',
  client: 'inherit',
});

const CATEGORIES = ['http', 'sync', 'mcp', 'db', 'app', 'client'] as const;

const levelItems = computed(() => [
  { label: t('logs.levels.debug'), value: 'debug' },
  { label: t('logs.levels.info'), value: 'info' },
  { label: t('logs.levels.warn'), value: 'warn' },
  { label: t('logs.levels.error'), value: 'error' },
]);
const categoryLevelItems = computed(() => [
  { label: t('settings.logging.inherit'), value: 'inherit' },
  ...levelItems.value,
  { label: t('settings.logging.off'), value: 'off' },
]);

// Adopt stored values only when they were actually written, never on the poll.
watch(
  () => data.value?.updatedAt,
  () => {
    const settings = data.value;
    if (!settings) return;
    enabled.value = settings.enabled;
    minLevel.value = settings.minLevel;
    retentionDays.value = String(settings.retentionDays);
    maxRows.value = String(settings.maxRows);
    captureClient.value = settings.captureClient;
    clientConsole.value = settings.clientConsole;
    mirrorStdout.value = settings.mirrorStdout;
    for (const category of CATEGORIES) {
      overrides.value[category] = settings.overrides[category] ?? 'inherit';
    }
  },
  { immediate: true },
);

function save(): void {
  const body: LoggingSettingsUpdate = {
    enabled: enabled.value,
    minLevel: minLevel.value,
    retentionDays: Number(retentionDays.value),
    maxRows: Number(maxRows.value),
    captureClient: captureClient.value,
    clientConsole: clientConsole.value,
    mirrorStdout: mirrorStdout.value,
    levels: {
      http: overrides.value.http as never,
      sync: overrides.value.sync as never,
      mcp: overrides.value.mcp as never,
      db: overrides.value.db as never,
      app: overrides.value.app as never,
      client: overrides.value.client as never,
    },
    dryRun: false,
  };
  void write('/api/v1/admin/logging', { method: 'PATCH', body }).then((result) => {
    if (result) void refresh();
  });
}
</script>

<template>
  <ProfilePane :title="t('settings.logging.title')">
    <template #actions>
      <UButton
        :label="t('settings.logging.save')"
        icon="i-lucide-save"
        size="xs"
        :loading="busy"
        @click="save"
      />
    </template>

    <p class="text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">{{ t('settings.logging.text') }}</p>

    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <USwitch v-model="enabled" :label="t('settings.logging.enabled')" />
      <USwitch v-model="captureClient" :label="t('settings.logging.captureClient')" />
      <USwitch v-model="clientConsole" :label="t('settings.logging.clientConsole')" />
      <USwitch v-model="mirrorStdout" :label="t('settings.logging.mirrorStdout')" />
    </div>

    <div class="mt-4 grid gap-3 sm:grid-cols-3">
      <UFormField :label="t('settings.logging.minLevel')">
        <USelect v-model="minLevel" :items="levelItems" class="w-full" />
      </UFormField>
      <UFormField :label="t('settings.logging.retentionDays')">
        <UInput v-model="retentionDays" type="number" min="1" max="365" class="w-full" />
      </UFormField>
      <UFormField :label="t('settings.logging.maxRows')">
        <UInput v-model="maxRows" type="number" min="1000" max="2000000" class="w-full" />
      </UFormField>
    </div>

    <div class="mt-4">
      <div class="sz-caps mb-2 text-[var(--sz-text-muted)]">{{ t('settings.logging.categories') }}</div>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField v-for="category in CATEGORIES" :key="category" :label="t(`logs.categories.${category}`)">
          <USelect v-model="overrides[category]" :items="categoryLevelItems" class="w-full" />
        </UFormField>
      </div>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-3 text-[11.5px] text-[var(--sz-text-muted)]">
      <span>{{ t('settings.logging.errorNote') }}</span>
      <UButton to="/logs" icon="i-lucide-bug" color="neutral" variant="link" size="xs" :label="t('settings.logging.openLogs')" />
    </div>
  </ProfilePane>
</template>
