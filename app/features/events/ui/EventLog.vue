<script setup lang="ts">
import { useQuery } from '@pinia/colada';
import { NON_ROLLBACKABLE_ACTIONS } from '@profile/shared/contracts';
import { QUERY_KEYS } from '~/stores/keys';
import type { EventRead } from '@profile/shared/contracts';
import { ConfirmActionModal, ProfilePane } from '~/shared/ui';
import {
  DIFF_ENTRY_LIMIT,
  EMPTY_EVENT_FILTERS,
  EVENT_ORIGINS,
  EVENT_WINDOWS,
  diffEntries,
  eventFacets,
  filterEvents,
  formatDiffValue,
  prettySnapshot,
  type EventFilters,
} from '../model/journal';

const { write, busy } = useWrite();
const { t, locale } = useI18n();

const request = useRequestFetch();
const {
  data: eventsPage,
  refetch: refresh,
} = useQuery({
  key: QUERY_KEYS.events,
  query: () => request<EventRead[]>('/api/v1/events', { query: { limit: 200 } }),
});
const events = computed(() => eventsPage.value ?? []);

const filters = ref<EventFilters>({ ...EMPTY_EVENT_FILTERS });
const expanded = ref<Record<string, boolean>>({});

const facets = computed(() => eventFacets(events.value));
const filtered = computed(() => filterEvents(events.value, filters.value));
const hasFilters = computed(
  () =>
    filters.value.text.trim() !== '' ||
    filters.value.action !== '' ||
    filters.value.entity !== '' ||
    filters.value.actor !== '' ||
    filters.value.window !== 'all',
);

/** USelect rejects an empty value; the UI maps this sentinel onto the model's empty string. */
const FILTER_ALL = '__all';

const actionItems = computed(() => [
  { label: t('events.filters.allActions'), value: FILTER_ALL },
  ...facets.value.actions.map((action) => ({ label: actionLabel(action), value: action })),
]);
const entityItems = computed(() => [
  { label: t('events.filters.allEntities'), value: FILTER_ALL },
  ...facets.value.entities.map((entity) => ({ label: entity, value: entity })),
]);
const actorItems = computed(() => [
  { label: t('events.filters.allActors'), value: FILTER_ALL },
  ...facets.value.actors.map((actor) => ({ label: actor, value: actor })),
]);

function setFilter(field: 'action' | 'entity' | 'actor', value: unknown): void {
  filters.value[field] = value === FILTER_ALL ? '' : String(value);
}
const windowItems = computed(() =>
  EVENT_WINDOWS.map((window) => ({ label: t(`events.windows.${window}`), value: window })),
);

const expandedOptions = {
  getRowCanExpand: () => true,
  getRowId: (row: EventRead) => String(row.id),
};

const target = ref<EventRead | null>(null);
const confirmOpen = computed({
  get: () => target.value !== null,
  set: (value: boolean) => {
    if (!value) target.value = null;
  },
});

const ACTION_KEYS: Record<string, string> = {
  'character.create': 'characterCreate',
  'character.update': 'profile',
  'character.delete': 'characterDelete',
  'character.stats.clear': 'characterStatsClear',
  // Kept so journal rows written before the inventory redesign stay readable.
  'owned.create': 'ownedCreate',
  'owned.update': 'ownedUpdate',
  'owned.delete': 'ownedDelete',
  'owned.clear': 'ownedClear',
  'container.fill': 'containerFill',
  'content.put': 'contentPut',
  'profile.clear': 'profileClear',
  'dossier.clear': 'profileClear',
  'inventory.item.create': 'itemCreate',
  'inventory.item.update': 'itemUpdate',
  'inventory.item.delete': 'itemDelete',
  'inventory.item.move': 'itemMove',
  'inventory.item.module': 'itemModule',
  'inventory.storage.create': 'storageCreate',
  'inventory.storage.update': 'storageUpdate',
  'inventory.storage.delete': 'storageDelete',
  'inventory.storage.tidy': 'storageTidy',
  'inventory.container.fill': 'containerFill',
  'inventory.autoArrange': 'autoArrange',
  'inventory.clear': 'inventoryClear',
  'journal.clear': 'journalClear',
  'reset.all': 'resetAll',
  rollback: 'rollback',
  'catalog.itemLayout.update': 'itemLayout',
  'logging.settings.update': 'loggingSettings',
  'log.clear': 'logClear',
  'sync.schedule.update': 'syncSchedule',
};

const columns = computed(() => [
  { id: 'expand', header: ' ', enableSorting: false, meta: { class: { td: 'w-6 pr-0' } } },
  {
    accessorKey: 'at',
    header: t('events.columns.at'),
    meta: { class: { td: 'whitespace-nowrap text-xs' } },
  },
  { accessorKey: 'action', header: t('events.columns.action'), meta: { class: { td: 'min-w-0' } } },
  {
    accessorKey: 'entity',
    header: t('events.columns.entity'),
    meta: {
      class: {
        td: 'hidden max-w-[10rem] truncate text-xs md:table-cell',
        th: 'hidden md:table-cell',
      },
    },
  },
  {
    accessorKey: 'origin',
    header: t('events.columns.origin'),
    meta: {
      class: { td: 'hidden whitespace-nowrap text-xs lg:table-cell', th: 'hidden lg:table-cell' },
    },
  },
  {
    accessorKey: 'actor',
    header: t('events.columns.actor'),
    meta: {
      class: { td: 'hidden whitespace-nowrap text-xs xl:table-cell', th: 'hidden xl:table-cell' },
    },
  },
  { id: 'actions', header: ' ', enableSorting: false, meta: { class: { td: 'text-right' } } },
]);

function actionLabel(action: string): string {
  const suffix = ACTION_KEYS[action];
  return suffix ? t(`events.actions.${suffix}`) : action;
}

function originLabel(origin: string): string {
  return (EVENT_ORIGINS as readonly string[]).includes(origin) ? t(`events.origins.${origin}`) : origin;
}

function summaryKindLabel(kind: EventRead['summary']['kind']): string {
  return t(`events.summary.${kind}`);
}

function formatDateTime(iso: string, compact = false): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const intlLocale = locale.value === 'ru' ? 'ru-RU' : 'en-US';
  const options: Intl.DateTimeFormatOptions = compact
    ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }
    : { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(intlLocale, options).format(date);
}

/** Events are append-only, so a per-id diff/snapshot cache never goes stale within a page. */
const diffCache = new Map<number, ReturnType<typeof diffEntries>>();
const snapshotCache = new Map<number, { before: ReturnType<typeof prettySnapshot>; after: ReturnType<typeof prettySnapshot> }>();

function rowDiff(event: EventRead): ReturnType<typeof diffEntries> {
  let result = diffCache.get(event.id);
  if (!result) {
    result = diffEntries(event.before, event.after, DIFF_ENTRY_LIMIT);
    diffCache.set(event.id, result);
  }
  return result;
}

function rowSnapshot(event: EventRead, side: 'before' | 'after'): { text: string; truncated: boolean } {
  let pair = snapshotCache.get(event.id);
  if (!pair) {
    pair = { before: prettySnapshot(event.before), after: prettySnapshot(event.after) };
    snapshotCache.set(event.id, pair);
  }
  return pair[side];
}

function resetFilters(): void {
  filters.value = { ...EMPTY_EVENT_FILTERS };
}

function startRollback(row: EventRead): void {
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
  <ProfilePane flush :title="t('events.title')">
    <template #actions>
      <span class="text-[11px] tabular-nums text-[var(--sz-text-muted)]">
        {{ t('events.count', { shown: filtered.length, total: events.length }) }}
      </span>
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

    <div class="grid gap-2 border-b border-[var(--sz-border)] p-2 sm:grid-cols-2 xl:grid-cols-6">
      <UInput
        v-model="filters.text"
        icon="i-lucide-search"
        size="xs"
        :placeholder="t('events.filters.search')"
        class="sm:col-span-2"
      />
      <USelect
        :model-value="filters.action || FILTER_ALL"
        :items="actionItems"
        size="xs"
        :aria-label="t('events.columns.action')"
        @update:model-value="(value) => setFilter('action', value)"
      />
      <USelect
        :model-value="filters.entity || FILTER_ALL"
        :items="entityItems"
        size="xs"
        :aria-label="t('events.columns.entity')"
        @update:model-value="(value) => setFilter('entity', value)"
      />
      <USelect
        :model-value="filters.actor || FILTER_ALL"
        :items="actorItems"
        size="xs"
        :aria-label="t('events.columns.actor')"
        @update:model-value="(value) => setFilter('actor', value)"
      />
      <div class="flex items-center gap-2">
        <USelect
          v-model="filters.window"
          :items="windowItems"
          size="xs"
          class="flex-1"
          :aria-label="t('events.filters.window')"
        />
        <UButton
          v-if="hasFilters"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="t('events.filters.clear')"
          @click="resetFilters"
        />
      </div>
    </div>

    <div v-if="events.length" class="max-h-[480px] overflow-auto">
      <UTable
        v-model:expanded="expanded"
        :data="filtered"
        :columns="columns"
        :expanded-options="expandedOptions"
        sticky="header"
        class="w-full text-[12.5px]"
      >
        <template #expand-cell="{ row }">
          <UButton
            :icon="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="
              t(row.getIsExpanded() ? 'events.collapseAria' : 'events.expandAria', {
                id: row.original.id,
              })
            "
            :aria-expanded="row.getIsExpanded()"
            @click="row.toggleExpanded()"
          />
        </template>
        <template #at-cell="{ row }">
          <span class="whitespace-nowrap tabular-nums text-[var(--sz-text-muted)]">
            <span class="sm:hidden">{{ formatDateTime(row.original.at, true) }}</span>
            <span class="hidden sm:inline">{{ formatDateTime(row.original.at) }}</span>
          </span>
        </template>
        <template #action-cell="{ row }">
          <span class="flex min-w-0 flex-col gap-0.5">
            <span
              class="inline-flex w-fit border border-[var(--sz-border)] px-1.5 py-0.5 text-[11px] leading-none text-[var(--sz-text-muted)]"
            >
              {{ actionLabel(row.original.action) }}
            </span>
            <span v-if="row.original.summary.fields.length" class="truncate text-[11px] text-[var(--sz-text-muted)]">
              {{ row.original.summary.fields.join(', ') }}
            </span>
          </span>
        </template>
        <template #entity-cell="{ row }">
          <span class="block truncate font-mono text-[11px]" :title="`${row.original.entity} / ${row.original.entityId}`">
            {{ row.original.entity }}
            <template v-if="row.original.entityId"> / {{ row.original.entityId }}</template>
          </span>
        </template>
        <template #origin-cell="{ row }">
          <span v-if="row.original.origin" class="text-[11px]">{{ originLabel(row.original.origin) }}</span>
          <span v-else class="text-[11px] text-[var(--sz-text-muted)]">{{ t('common.dash') }}</span>
        </template>
        <template #actor-cell="{ row }">
          <span class="text-[11px]">{{ row.original.actor }}</span>
        </template>
        <template #actions-cell="{ row }">
          <UButton
            v-if="!NON_ROLLBACKABLE_ACTIONS.includes(row.original.action as never)"
            icon="i-lucide-undo-2"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('events.rollbackAria', { id: row.original.id })"
            @click="startRollback(row.original)"
          />
        </template>
        <template #expanded="{ row }">
          <div class="space-y-3 border-l-2 border-[var(--sz-border)] py-2 pl-3 text-[12px]">
            <dl class="grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('events.detail.summary') }}</dt>
                <dd class="flex flex-wrap items-baseline gap-x-2">
                  <span>{{ summaryKindLabel(row.original.summary.kind) }}</span>
                  <span v-if="row.original.summary.fields.length" class="font-mono text-[11px]">
                    {{ row.original.summary.fields.join(', ') }}
                  </span>
                </dd>
              </div>
              <div v-if="row.original.requestId">
                <dt class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('events.detail.requestId') }}</dt>
                <dd>
                  <NuxtLink
                    :to="{ path: '/logs', query: { requestId: row.original.requestId } }"
                    class="break-all font-mono text-[11px] text-[var(--sz-accent)] hover:underline"
                  >
                    {{ row.original.requestId }}
                  </NuxtLink>
                </dd>
              </div>
              <div v-if="row.original.origin">
                <dt class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('events.detail.origin') }}</dt>
                <dd>{{ originLabel(row.original.origin) }}</dd>
              </div>
              <div v-if="row.original.note">
                <dt class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('events.columns.note') }}</dt>
                <dd class="break-words">{{ row.original.note }}</dd>
              </div>
            </dl>

            <div>
              <h4 class="sz-caps mb-1 text-[10.5px] text-[var(--sz-text-muted)]">{{ t('events.diff.title') }}</h4>
              <table v-if="rowDiff(row.original).entries.length" class="w-full table-fixed text-[11.5px]">
                <thead>
                  <tr class="text-left text-[var(--sz-text-muted)]">
                    <th class="w-1/4 py-0.5 font-normal">{{ t('events.diff.field') }}</th>
                    <th class="w-[37.5%] py-0.5 font-normal">{{ t('events.diff.before') }}</th>
                    <th class="w-[37.5%] py-0.5 font-normal">{{ t('events.diff.after') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="entry in rowDiff(row.original).entries" :key="entry.path" class="align-top">
                    <td class="break-all py-0.5 pr-2 font-mono text-[11px]">
                      {{ entry.path || t('events.diff.root') }}
                    </td>
                    <td class="break-all py-0.5 pr-2">
                      <span :class="entry.kind === 'added' ? 'text-[var(--sz-text-muted)]' : ''">
                        {{ entry.kind === 'added' ? t('common.dash') : formatDiffValue(entry.before) }}
                      </span>
                    </td>
                    <td class="break-all py-0.5">
                      {{ entry.kind === 'removed' ? t('common.dash') : formatDiffValue(entry.after) }}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="text-[11.5px] text-[var(--sz-text-muted)]">{{ t('events.diff.empty') }}</p>
              <p v-if="rowDiff(row.original).truncated" class="mt-1 text-[11px] text-[var(--sz-text-muted)]">
                {{ t('events.diff.truncated', { count: DIFF_ENTRY_LIMIT }) }}
              </p>
            </div>

            <details>
              <summary class="cursor-pointer text-[11.5px] text-[var(--sz-text-muted)]">
                {{ t('events.diff.raw') }}
              </summary>
              <div class="mt-2 grid gap-2 md:grid-cols-2">
                <div>
                  <h5 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('events.diff.before') }}</h5>
                  <pre class="max-h-48 overflow-auto whitespace-pre-wrap break-all bg-[var(--sz-bg)] p-2 text-[10.5px]">{{ rowSnapshot(row.original, 'before').text || t('common.dash') }}</pre>
                  <p
                    v-if="rowSnapshot(row.original, 'before').truncated"
                    class="text-[10.5px] text-[var(--sz-text-muted)]"
                  >
                    {{ t('events.diff.rawTruncated') }}
                  </p>
                </div>
                <div>
                  <h5 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('events.diff.after') }}</h5>
                  <pre class="max-h-48 overflow-auto whitespace-pre-wrap break-all bg-[var(--sz-bg)] p-2 text-[10.5px]">{{ rowSnapshot(row.original, 'after').text || t('common.dash') }}</pre>
                  <p
                    v-if="rowSnapshot(row.original, 'after').truncated"
                    class="text-[10.5px] text-[var(--sz-text-muted)]"
                  >
                    {{ t('events.diff.rawTruncated') }}
                  </p>
                </div>
              </div>
            </details>
          </div>
        </template>
        <template #empty>
          <span class="text-[var(--sz-text-muted)]">{{ t('filters.noMatch') }}</span>
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
  </ProfilePane>

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
