<script setup lang="ts">
import type { ChatAttachment } from '@profile/shared/contracts';
import { computed } from 'vue';

import type { ChatItemView } from '../model/render';
import { toolRunCounts, type ChatRow } from '../model/rows';
import ChatMessageRow from './ChatMessageRow.vue';
import ChatToolResult from './ChatToolResult.vue';

const props = defineProps<{ row: ChatRow | null }>();
const emit = defineEmits<{
  copy: [text: string];
  openImage: [file: ChatAttachment];
  openFile: [file: ChatAttachment];
  openItem: [item: ChatItemView];
}>();

const { t } = useI18n();

/** One badge per distinct action over the whole group, e.g. find_items ×2, get_prices ×1. */
const counts = computed(() => (props.row?.kind === 'tools' ? toolRunCounts(props.row.runs) : []));
</script>

<template>
  <ChatMessageRow
    v-if="props.row && props.row.kind !== 'tools'"
    :row="props.row"
    @copy="emit('copy', $event)"
    @open-image="emit('openImage', $event)"
    @open-file="emit('openFile', $event)"
  />

  <UCollapsible
    v-else-if="props.row"
    class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)]/40"
  >
    <template #default="{ open }">
      <button
        type="button"
        class="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
        :aria-expanded="open"
      >
        <UIcon name="i-lucide-wrench" class="size-3.5 shrink-0 text-[var(--sz-text-muted)]" aria-hidden="true" />
        <span class="text-[12px] text-[var(--sz-text-muted)]">
          {{ t('chat.toolsUsed', { count: props.row.runs.length }) }}
        </span>
        <span class="flex min-w-0 flex-wrap items-center gap-1">
          <UBadge
            v-for="action in counts"
            :key="action.name"
            size="sm"
            color="neutral"
            variant="subtle"
            class="font-mono"
          >
            {{ action.name }}<span class="ms-1 tabular-nums">×{{ action.count }}</span>
          </UBadge>
        </span>
        <UIcon
          name="i-lucide-chevron-down"
          class="ms-auto size-4 shrink-0 text-[var(--sz-text-muted)] transition-transform duration-[160ms]"
          :class="open ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>
    </template>

    <template #content>
      <div class="max-h-[380px] divide-y divide-[var(--sz-border)] overflow-y-auto border-t border-[var(--sz-border)] px-2.5 py-2">
        <div v-for="run in props.row.runs" :key="run.id" class="py-2 first:pt-0 last:pb-0">
          <div class="mb-1 flex items-baseline gap-2">
            <span class="font-mono text-[11px] text-[var(--sz-text-muted)]">{{ run.name }}</span>
            <span v-if="run.status === 'declined'" class="text-[11px] text-[var(--sz-warning-text)]">
              {{ t('chat.toolDeclined') }}
            </span>
          </div>
          <ChatToolResult
            v-if="run.status !== 'declined'"
            :tool-name="run.name"
            :payload="run.payload"
            @open-item="emit('openItem', $event)"
          />
        </div>
      </div>
    </template>
  </UCollapsible>
</template>
