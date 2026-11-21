<script setup lang="ts">
import type { ChatThread } from '@profile/shared/contracts';
import { computed } from 'vue';

import { groupThreads, type ChatThreadGroupKey } from '../model/threadList';

const props = defineProps<{ threads: ChatThread[]; activeThreadId: number | null; disabled: boolean }>();
const emit = defineEmits<{ open: [id: number]; delete: [thread: ChatThread] }>();
const query = defineModel<string>('query', { default: '' });

const { t, locale } = useI18n();
const groups = computed(() => groupThreads(props.threads, new Date()));
const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }));
function threadTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.value.format(date);
}
const GROUP_LABELS: Record<ChatThreadGroupKey, string> = {
  today: 'chat.groupToday',
  yesterday: 'chat.groupYesterday',
  earlier: 'chat.groupEarlier',
};
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="p-2 pb-1">
      <UInput
        v-model="query"
        size="sm"
        icon="i-lucide-search"
        class="w-full"
        :placeholder="t('chat.threadSearch')"
        :aria-label="t('chat.threadSearch')"
      />
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="!threads.length" class="px-2 py-1 text-[12px] text-[var(--sz-text-dim)]">{{ t('chat.noThreads') }}</p>
      <p v-else-if="!groups.length" class="px-2 py-1 text-[12px] text-[var(--sz-text-dim)]">
        {{ t('chat.threadSearchEmpty', { query }) }}
      </p>

      <div v-for="group in groups" :key="group.key">
        <p class="sz-caps px-2 pb-1 pt-2 text-[10px] text-[var(--sz-text-muted)]">{{ t(GROUP_LABELS[group.key]) }}</p>
        <ul>
          <li v-for="thread in group.threads" :key="thread.id" class="flex items-stretch">
            <button
              type="button"
              class="min-w-0 flex-1 border-l-2 px-2 py-1.5 text-left text-[12px] transition-colors"
              :class="
                thread.id === activeThreadId
                  ? 'border-[var(--sz-accent)] bg-[var(--sz-surface-alt)] text-[var(--sz-text)]'
                  : 'border-transparent text-[var(--sz-text-muted)] hover:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-text)]'
              "
              @click="emit('open', thread.id)"
            >
              <span class="block truncate">{{ thread.title }}</span>
              <span class="mt-0.5 block text-[10px] tabular-nums text-[var(--sz-text-dim)]">
                {{ threadTime(thread.updatedAt) }}
              </span>
            </button>
            <button
              type="button"
              class="flex w-7 shrink-0 items-center justify-center border-l-2 border-transparent text-[var(--sz-text-dim)] transition-colors hover:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-warning-text)] disabled:opacity-40 max-sm:w-11"
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
