<script setup lang="ts">
import { RankBadge, VirtualBadge } from '~/entities/item';
import type { ChatItemCandidate } from '../model/mentions';

const props = defineProps<{
  id: string;
  candidates: ChatItemCandidate[];
  activeIndex: number;
  pinned: ReadonlySet<string>;
  loading?: boolean;
}>();
const emit = defineEmits<{
  select: [index: number];
  pin: [index: number];
  hover: [index: number];
}>();
const { t } = useI18n();

function keyOf(candidate: ChatItemCandidate): string {
  return `${candidate.kind}:${candidate.itemId}:${candidate.instanceId ?? 'catalog'}`;
}

function groupOf(index: number): string {
  const candidate = props.candidates[index];
  if (!candidate) return '';
  const previous = props.candidates[index - 1];
  return previous?.source === candidate.source ? '' : t(`chat.mention.${candidate.source}`);
}

function pinLabel(candidate: ChatItemCandidate): string {
  return props.pinned.has(keyOf(candidate))
    ? t('chat.mention.unpin', { name: candidate.name })
    : t('chat.mention.pin', { name: candidate.name });
}
</script>

<template>
  <div
    class="absolute inset-x-0 bottom-full z-30 mb-1 max-h-72 overflow-y-auto border border-[var(--sz-border-strong)] bg-[var(--sz-surface)] shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
  >
    <ul
      :id="props.id"
      role="listbox"
      :aria-label="t('chat.mention.title')"
      class="divide-y divide-[var(--sz-border)]"
    >
      <template v-for="(candidate, index) in props.candidates" :key="candidate.token">
        <li v-if="groupOf(index)" class="sz-caps bg-[var(--sz-surface-alt)] px-2.5 py-1 text-[10px] text-[var(--sz-text-dim)]" role="presentation">
          {{ groupOf(index) }}
        </li>
        <li
          :id="`${props.id}-${index}`"
          role="option"
          :aria-selected="index === props.activeIndex"
          class="flex cursor-pointer items-center gap-2 px-2.5 py-1.5"
          :class="index === props.activeIndex ? 'bg-[var(--sz-surface-header)]' : ''"
          @mousedown.prevent="emit('select', index)"
          @mouseenter="emit('hover', index)"
        >
          <img v-if="candidate.icon" :src="candidate.icon" alt="" class="size-6 shrink-0 object-contain">
          <UIcon v-else name="i-lucide-package" class="size-6 shrink-0 text-[var(--sz-text-dim)]" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate text-[12.5px] text-[var(--sz-text)]">{{ candidate.name }}</span>
          <RankBadge v-if="candidate.rank" :rank="candidate.rank" />
          <span v-if="candidate.level != null" class="shrink-0 text-[10px] tabular-nums text-[var(--sz-text-dim)]">
            {{ t('chat.mention.level', { level: candidate.level }) }}
          </span>
          <VirtualBadge v-if="candidate.virtual" />
          <button
            type="button"
            class="shrink-0 p-1 text-[var(--sz-text-dim)] hover:text-[var(--sz-text)] max-sm:size-11 max-sm:p-0"
            :aria-label="pinLabel(candidate)"
            :title="pinLabel(candidate)"
            @mousedown.prevent.stop="emit('pin', index)"
            @click.stop
          >
            <UIcon
              :name="props.pinned.has(keyOf(candidate)) ? 'i-lucide-pin-off' : 'i-lucide-pin'"
              class="size-3.5"
              aria-hidden="true"
            />
          </button>
        </li>
      </template>
    </ul>
    <p v-if="!props.candidates.length" class="px-2.5 py-2 text-[12px] text-[var(--sz-text-muted)]">
      {{ props.loading ? t('chat.mention.loading') : t('chat.mention.empty') }}
    </p>
  </div>
</template>
