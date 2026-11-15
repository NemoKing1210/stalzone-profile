<script setup lang="ts">
import type { EventRow } from '~/types/dossier';

const { write, busy } = useWrite();

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

const ACTION_LABELS: Record<string, string> = {
  'character.update': 'Профиль',
  'owned.create': 'Добавление предмета',
  'owned.update': 'Изменение предмета',
  'owned.delete': 'Удаление предмета',
  'container.fill': 'Наполнение контейнера',
  'build.save': 'Сохранение сборки',
  'build.delete': 'Удаление сборки',
  'content.put': 'Изменение блока',
  rollback: 'Откат',
};

const columns = [
  { accessorKey: 'at', header: 'Когда', meta: { class: { td: 'whitespace-nowrap text-xs' } } },
  { accessorKey: 'action', header: 'Действие' },
  { accessorKey: 'entityId', header: 'Объект', meta: { class: { td: 'text-xs' } } },
  { accessorKey: 'actor', header: 'Кто' },
  { accessorKey: 'note', header: 'Примечание', meta: { class: { td: 'text-xs text-muted min-w-40' } } },
  { accessorKey: 'actions', header: ' ', enableSorting: false, meta: { class: { td: 'text-right' } } },
];

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(date);
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
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-history" class="size-5 text-primary" />
          <h2 class="font-medium">Журнал изменений</h2>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="xs"
          label="Обновить"
          :loading="busy"
          @click="refresh()"
        />
      </div>
    </template>

    <UTable v-if="events.length" :data="events" :columns="columns">
      <template #at-cell="{ row }">
        {{ formatDateTime(row.original.at) }}
      </template>
      <template #action-cell="{ row }">
        <UBadge color="neutral" variant="subtle">{{ actionLabel(row.original.action) }}</UBadge>
      </template>
      <template #entityId-cell="{ row }">
        <span class="font-mono">{{ row.original.entity }} / {{ row.original.entityId }}</span>
      </template>
      <template #actions-cell="{ row }">
        <UButton
          v-if="row.original.action !== 'rollback'"
          icon="i-lucide-undo-2"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="`Откатить событие ${row.original.id}`"
          @click="startRollback(row.original)"
        />
      </template>
      <template #empty>
        <span class="text-muted">Изменений пока не было.</span>
      </template>
    </UTable>
    <div v-else class="p-4">
      <UEmpty
        icon="i-lucide-history"
        title="Журнал пуст"
        description="Здесь появятся правки из сайта, API и MCP."
      />
    </div>

    <ConfirmActionModal
      v-model:open="confirmOpen"
      title="Откатить изменение"
      :description="`Вернуть состояние до события #${target?.id ?? ''} (${target ? actionLabel(target.action) : ''})? Откат тоже попадёт в журнал.`"
      confirm-label="Откатить"
      :loading="busy"
      @confirm="rollback"
    />
  </UCard>
</template>
