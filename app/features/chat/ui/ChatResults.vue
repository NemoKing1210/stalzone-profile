<script setup lang="ts">
import { ProfileItemCard } from '~/entities/item';

import { useChatStore } from '~/stores/chat';
import { chatAnswer } from '../model/answer';
import { candidateFromToolItem, type ChatItemCandidate } from '../model/mentions';
import type { ChatItemView } from '../model/render';
import type { ChatToolRunView } from '../model/rows';
import ChatChart from './ChatChart.vue';
import ChatPrices from './ChatPrices.vue';

const props = defineProps<{ runs: ChatToolRunView[] }>();
const emit = defineEmits<{ openItem: [item: ChatItemView] }>();

const { t } = useI18n();
const chat = useChatStore();
const answer = computed(() => chatAnswer(props.runs));
const pinned = computed(
  () => new Set(chat.pins.map((pin) => `${pin.kind}:${pin.itemId}:${pin.instanceId ?? 'catalog'}`)),
);
const limit = ref(12);
const visible = computed(() => answer.value.items.slice(0, limit.value));
const hidden = computed(() => answer.value.items.length - visible.value.length);

watch(
  () => props.runs,
  () => {
    limit.value = 12;
  },
);

/** The two facts a card adds to the entity card; weight and level already sit there. */
function statsOf(item: ChatItemView): { label: string; value: string }[] {
  const stats: { label: string; value: string }[] = [];
  if (item.qty != null) stats.push({ label: t('chat.columns.qty'), value: String(item.qty) });
  if (item.location) stats.push({ label: t('chat.columns.location'), value: item.location });
  return stats;
}

function pinOf(item: ChatItemView): ChatItemCandidate | null {
  return candidateFromToolItem(item);
}

function isPinned(item: ChatItemView): boolean {
  const candidate = pinOf(item);
  return candidate ? pinned.value.has(`${candidate.kind}:${candidate.itemId}:${candidate.instanceId ?? 'catalog'}`) : false;
}

function pinLabel(item: ChatItemView): string {
  return isPinned(item) ? t('chat.mention.unpin', { name: item.name }) : t('chat.mention.pin', { name: item.name });
}

function togglePin(item: ChatItemView): void {
  const candidate = pinOf(item);
  if (!candidate) return;
  void chat.togglePin({
    kind: candidate.kind,
    itemId: candidate.itemId,
    ...(candidate.instanceId == null ? {} : { instanceId: candidate.instanceId }),
  });
}
</script>

<template>
  <section
    v-if="answer.items.length || answer.prices.length || answer.text.length"
    class="mt-2 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)]/40"
    :aria-label="t('chat.answer.title')"
  >
    <header class="flex items-center gap-2 border-b border-[var(--sz-border)] px-2.5 py-1.5">
      <UIcon name="i-lucide-sparkles" class="size-3.5 shrink-0 text-[var(--sz-accent)]" aria-hidden="true" />
      <span class="sz-caps text-[10px] text-[var(--sz-text-muted)]">{{ t('chat.answer.title') }}</span>
      <span v-if="answer.items.length" class="text-[10px] tabular-nums text-[var(--sz-text-dim)]">
        {{ t('chat.answer.count', { count: answer.items.length }) }}
      </span>
    </header>

    <div class="space-y-2 p-2">
      <ChatChart v-if="answer.chart" :chart="answer.chart" @open-item="emit('openItem', $event)" />

      <div v-if="visible.length" class="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="(item, index) in visible"
          :key="item.instanceId ?? `${item.name}-${index}`"
          class="relative"
        >
          <ProfileItemCard
            :name="item.name"
            :rank="item.rank"
            :category="item.category"
            :level="item.level"
            :icon="item.icon"
            :virtual="item.virtual"
            :weight="item.weight"
            :stats="statsOf(item)"
            :priority="index < 4"
            open-on-click
            @open="emit('openItem', item)"
          />
          <button
            v-if="pinOf(item)"
            type="button"
            class="absolute bottom-1 end-1 z-10 flex size-6 items-center justify-center border border-[var(--sz-border)] bg-[var(--sz-surface)]/95 transition-colors hover:text-[var(--sz-text)] max-sm:size-11"
            :class="isPinned(item) ? 'text-[var(--sz-accent)]' : 'text-[var(--sz-text-dim)]'"
            :aria-pressed="isPinned(item)"
            :aria-label="pinLabel(item)"
            :title="pinLabel(item)"
            @click.stop="togglePin(item)"
          >
            <UIcon :name="isPinned(item) ? 'i-lucide-pin-off' : 'i-lucide-pin'" class="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <UButton
        v-if="hidden > 0"
        size="xs"
        color="neutral"
        variant="ghost"
        :label="t('chat.answer.showAll', { count: answer.items.length })"
        @click="limit = answer.items.length"
      />

      <ChatPrices v-if="answer.prices.length" :prices="answer.prices" />

      <p
        v-for="(line, index) in answer.text"
        :key="index"
        class="text-[12.5px] leading-relaxed text-[var(--sz-text)]"
      >
        {{ line }}
      </p>
    </div>
  </section>
</template>
