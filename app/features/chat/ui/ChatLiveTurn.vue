<script setup lang="ts">
import { computed } from 'vue';

import type { LiveTurn } from '~/shared/lib/chatStream';
import ChatMarkdown from './ChatMarkdown.vue';

const props = defineProps<{ live: LiveTurn | null; streaming: boolean }>();
const { t } = useI18n();

const running = computed(() =>
  Object.values(props.live?.tools ?? {}).filter((tool) => tool.phase === 'running'),
);
</script>

<template>
  <div class="min-w-0">
    <div class="mb-1 flex items-baseline gap-2">
      <span class="sz-caps text-[10px] text-[var(--sz-text-muted)]">{{ t('chat.roleAssistant') }}</span>
    </div>

    <UChatReasoning v-if="live?.reasoning" :text="live.reasoning" streaming :auto-close-delay="0" />
    <ChatMarkdown v-if="live?.text" :text="live.text" />
    <!-- The reasoning block is already the "working" state; a second shimmer duplicates it. -->
    <p v-else-if="streaming && !live?.reasoning" class="text-[12.5px] text-[var(--sz-text-muted)]" role="status">
      <UChatShimmer :text="t('chat.thinking')" />
    </p>

    <ul v-if="running.length" class="mt-1 space-y-0.5">
      <li
        v-for="tool in running"
        :key="tool.id"
        class="flex items-center gap-1.5 font-mono text-[11px] text-[var(--sz-text-dim)]"
      >
        <UIcon name="i-lucide-loader-circle" class="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {{ tool.name }}
      </li>
    </ul>
  </div>
</template>
