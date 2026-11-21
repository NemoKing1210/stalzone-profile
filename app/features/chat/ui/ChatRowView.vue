<script setup lang="ts">
import type { ChatAttachment } from '@profile/shared/contracts';
import { computed } from 'vue';

import type { ChatItemView } from '../model/render';
import { toolRunCounts, type ChatRow, type ChatToolRunView } from '../model/rows';
import ChatMessageRow from './ChatMessageRow.vue';
import ChatResults from './ChatResults.vue';

const props = defineProps<{ row: ChatRow | null }>();
const emit = defineEmits<{
  copy: [text: string];
  openImage: [file: ChatAttachment];
  openFile: [file: ChatAttachment];
  openItem: [item: ChatItemView];
  retry: [messageId: string];
}>();

const { t } = useI18n();

/** One badge per distinct action over the whole group, e.g. find_items ×2, get_prices ×1. */
const counts = computed(() => (props.row?.kind === 'tools' ? toolRunCounts(props.row.runs) : []));
const results = computed(() => (props.row?.kind === 'assistant' ? props.row.results : []));

function retry(): void {
  if (props.row?.kind === 'user') emit('retry', props.row.id);
}

/** The tool block is the model's working log: raw payload, bounded so a 55 KB search stays cheap. */
function payloadText(run: ChatToolRunView): string {
  try {
    const text = JSON.stringify(run.payload, null, 2) ?? '—';
    return text.length > 4_000 ? `${text.slice(0, 4_000)}\n…` : text;
  } catch {
    return '—';
  }
}
</script>

<template>
  <div v-if="props.row && props.row.kind !== 'tools'">
    <ChatMessageRow
      :row="props.row"
      @copy="emit('copy', $event)"
      @open-image="emit('openImage', $event)"
      @open-file="emit('openFile', $event)"
      @retry="retry"
    />
    <ChatResults
      v-if="results.length"
      :runs="results"
      @open-item="emit('openItem', $event)"
    />
  </div>

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
          <div class="flex items-baseline gap-2">
            <span class="font-mono text-[11px] text-[var(--sz-text-muted)]">{{ run.name }}</span>
            <span v-if="run.status === 'declined'" class="text-[11px] text-[var(--sz-warning-text)]">
              {{ t('chat.toolDeclined') }}
            </span>
            <span class="ms-auto text-[10px] tabular-nums text-[var(--sz-text-dim)]">{{ run.id }}</span>
          </div>
          <details class="mt-1">
            <summary class="cursor-pointer text-[10px] text-[var(--sz-text-dim)]">payload</summary>
            <pre class="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-[10.5px] text-[var(--sz-text-muted)]">{{
              payloadText(run)
            }}</pre>
          </details>
        </div>
      </div>
    </template>
  </UCollapsible>
</template>
