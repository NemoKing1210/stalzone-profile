<script setup lang="ts">
import type { ChatThread } from '@profile/shared/contracts';
import { computed } from 'vue';

import { groupThreads, type ChatThreadGroupKey } from '../model/threadList';

const props = defineProps<{
  threads: ChatThread[];
  /** The store's unfiltered count, so an empty search is not confused with an empty history. */
  hasThreads: boolean;
  activeThreadId: number | null;
  disabled: boolean;
}>();
const emit = defineEmits<{ open: [id: number]; delete: [thread: ChatThread]; create: [] }>();
const query = defineModel<string>('query', { default: '' });

const { t, locale } = useI18n();
const groups = computed(() => groupThreads(props.threads, new Date()));
const timeFormat = computed(
  () => new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', hour12: false }),
);
const dayFormat = computed(() => new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }));

/** Within today/yesterday the clock is enough; an older thread keeps its calendar day. */
function threadStamp(value: string, group: ChatThreadGroupKey): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return (group === 'earlier' ? dayFormat.value : timeFormat.value).format(date);
}

const GROUP_LABELS: Record<ChatThreadGroupKey, string> = {
  today: 'chat.groupToday',
  yesterday: 'chat.groupYesterday',
  earlier: 'chat.groupEarlier',
};
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex shrink-0 items-center gap-1.5 px-2 py-2">
      <UInput
        v-model="query"
        size="sm"
        icon="i-lucide-search"
        class="min-w-0 flex-1"
        :placeholder="t('chat.threadSearch')"
        :aria-label="t('chat.threadSearch')"
      />
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-lucide-plus"
        class="shrink-0 max-sm:size-11"
        :aria-label="t('chat.newThread')"
        :title="t('chat.newThread')"
        @click="emit('create')"
      />
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto pb-2">
      <div
        v-if="!hasThreads"
        class="flex h-full flex-col items-center justify-center gap-2 px-4 py-10 text-center"
      >
        <UIcon name="i-lucide-messages-square" class="size-6 text-[var(--sz-text-dim)]" aria-hidden="true" />
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('chat.noThreads') }}</p>
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-plus"
          :label="t('chat.newThread')"
          @click="emit('create')"
        />
      </div>

      <div v-else-if="!groups.length" class="flex flex-col items-center gap-1.5 px-4 py-8 text-center" role="status">
        <p class="text-[12px] text-[var(--sz-text-dim)]">{{ t('chat.threadSearchEmpty', { query }) }}</p>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t('chat.clearSearch')"
          @click="query = ''"
        />
      </div>

      <div v-for="group in groups" :key="group.key">
        <p class="sticky top-0 z-10 flex items-center gap-2 bg-ink-950 px-3 pb-1 pt-3">
          <span class="sr-only">{{ t('chat.groupLabel', { group: t(GROUP_LABELS[group.key]), count: group.threads.length }) }}</span>
          <span aria-hidden="true" class="sz-caps shrink-0 text-[var(--sz-text-muted)]">{{ t(GROUP_LABELS[group.key]) }}</span>
          <span aria-hidden="true" class="h-px min-w-3 flex-1 bg-[var(--sz-border)]" />
          <span aria-hidden="true" class="shrink-0 text-[10px] tabular-nums text-[var(--sz-text-dim)]">{{ group.threads.length }}</span>
        </p>
        <ul>
          <li v-for="thread in group.threads" :key="thread.id" class="group/row flex items-stretch">
            <button
              type="button"
              class="min-w-0 flex-1 border-l-2 px-3 py-1.5 text-left transition-colors"
              :class="
                thread.id === activeThreadId
                  ? 'border-[var(--sz-accent)] bg-[var(--sz-surface-alt)] text-[var(--sz-text)]'
                  : 'border-transparent text-[var(--sz-text-muted)] hover:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-text)]'
              "
              :aria-current="thread.id === activeThreadId ? 'true' : undefined"
              :title="thread.title"
              @click="emit('open', thread.id)"
            >
              <span class="block truncate text-[12.5px] leading-snug">{{ thread.title }}</span>
              <span class="mt-0.5 block text-[10.5px] tabular-nums text-[var(--sz-text-dim)]">
                {{ threadStamp(thread.updatedAt, group.key) }}
              </span>
            </button>
            <button
              type="button"
              class="flex w-8 shrink-0 items-center justify-center border-l-2 border-transparent text-[var(--sz-text-dim)] opacity-0 transition-[color,background-color,opacity] hover:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-danger-text)] focus-visible:opacity-100 group-hover/row:opacity-100 disabled:opacity-40 max-lg:w-10 max-lg:opacity-100 max-sm:w-11"
              :disabled="disabled"
              :aria-label="t('chat.deleteThreadName', { title: thread.title })"
              :title="t('chat.deleteThread')"
              @click="emit('delete', thread)"
            >
              <UIcon name="i-lucide-trash-2" class="size-3.5" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
