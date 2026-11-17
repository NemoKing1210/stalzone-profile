<script setup lang="ts">
import { ConfirmActionModal, DossierPane } from '~/shared/ui';

import type { EventRow } from '~/shared/types/dossier';

const { write, busy } = useWrite();
const { t, locale } = useI18n();

const { data: events, refresh } = useFetch<EventRow[]>('/api/v1/events', {
  query: { limit: 50 },
  key: 'event-log',
  default: () => [],
});

const target = ref<EventRow | null>(null);
const confirmOpen = computed({
  get: () => target.value !== null,
  set: (value: boolean) => {
    if (!value) target.value = null;
  },
});

const ACTION_KEYS: Record<string, string> = {
  'character.create': 'characterCreate',
  'character.update': 'profile',
  'owned.create': 'ownedCreate',
  'owned.update': 'ownedUpdate',
  'owned.delete': 'ownedDelete',
  'container.fill': 'containerFill',
  'build.save': 'buildSave',
  'build.delete': 'buildDelete',
  'content.put': 'contentPut',
  'owned.clear': 'ownedClear',
  'build.clear': 'buildClear',
  'dossier.clear': 'dossierClear',
  rollback: 'rollback',
};

const columns = computed(() => [
  { accessorKey: 'at', header: t('events.columns.at'), meta: { class: { td: 'whitespace-nowrap text-xs' } } },
  { accessorKey: 'action', header: t('events.columns.action') },
  { accessorKey: 'entityId', header: t('events.columns.entityId'), meta: { class: { td: 'text-xs' } } },
  { accessorKey: 'actor', header: t('events.columns.actor') },
  { accessorKey: 'note', header: t('events.columns.note'), meta: { class: { td: 'text-xs text-muted min-w-40' } } },
  { accessorKey: 'actions', header: ' ', enableSorting: false, meta: { class: { td: 'text-right' } } },
]);

function actionLabel(action: string): string {
  const suffix = ACTION_KEYS[action];
  return suffix ? t(`events.actions.${suffix}`) : action;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const intlLocale = locale.value === 'ru' ? 'ru-RU' : 'en-US';
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function startRollback(row: EventRow): void {
  if (row.action === 'rollback') return;
  target.value = row;
}

async function rollback(): Promise<void> {
  const row = target.value;
  if (!row) return;

  const result = await write(`/api/v1/events/${row.id}/rollback`, {
    method: 'POST',
    body: { dryRun: false },
  });
  if (!result) return;

  confirmOpen.value = false;
  await refresh();
}
</script>

<template>
  <DossierPane flush :title="t('events.title')">
    <template #actions>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        size="xs"
        :label="t('events.refresh')"
        :loading="busy"
        @click="refresh()"
      />
    </template>

    <div v-if="events.length" class="max-h-[480px] overflow-auto">
      <UTable :data="events" :columns="columns" sticky="header" class="min-w-[760px] text-[12.5px]">
        <template #at-cell="{ row }">
          <span class="whitespace-nowrap tabular-nums text-[var(--sz-text-muted)]">
            {{ formatDateTime(row.original.at) }}
          </span>
        </template>
        <template #action-cell="{ row }">
          <span
            class="inline-flex border border-[var(--sz-border)] px-1.5 py-0.5 text-[11px] uppercase leading-none tracking-[0.1em] text-[var(--sz-text-muted)]"
          >
            {{ actionLabel(row.original.action) }}
          </span>
        </template>
        <template #entityId-cell="{ row }">
          <span class="font-mono text-[11px]">{{ row.original.entity }} / {{ row.original.entityId }}</span>
        </template>
        <template #actions-cell="{ row }">
          <UButton
            v-if="row.original.action !== 'rollback'"
            icon="i-lucide-undo-2"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('events.rollbackAria', { id: row.original.id })"
            @click="startRollback(row.original)"
          />
        </template>
        <template #empty>
          <span class="text-[var(--sz-text-muted)]">{{ t('events.empty') }}</span>
        </template>
      </UTable>
    </div>
    <div v-else class="p-4">
      <UEmpty
        icon="i-lucide-history"
        :title="t('events.emptyTitle')"
        :description="t('events.emptyDescription')"
      />
    </div>
  </DossierPane>

  <ConfirmActionModal
    v-model:open="confirmOpen"
    :title="t('events.rollbackTitle')"
    :description="
      t('events.rollbackConfirm', {
        id: target?.id ?? '',
        action: target ? actionLabel(target.action) : '',
      })
    "
    :confirm-label="t('common.rollback')"
    :loading="busy"
    @confirm="rollback"
  />
</template>
