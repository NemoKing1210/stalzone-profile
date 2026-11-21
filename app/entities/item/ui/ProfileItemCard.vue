<script setup lang="ts">
import ItemIconFallback from './ItemIconFallback.vue';
import RankBadge from './RankBadge.vue';
import RarityName from './RarityName.vue';
import VirtualBadge from './VirtualBadge.vue';

interface ItemStat {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'danger' | 'warning';
}

withDefaults(
  defineProps<{
    name: string;
    rank?: string | null;
    category?: string | null;
    level?: number | null;
    icon?: string | null;
    weight?: number | null;
    virtual?: boolean;
    stats?: ItemStat[];
    description?: string;
    priority?: boolean;
  }>(),
  {
    rank: undefined,
    category: undefined,
    level: undefined,
    icon: undefined,
    weight: null,
    virtual: false,
    stats: undefined,
    description: undefined,
    priority: false,
  },
);

defineEmits<{ open: [] }>();

const { t } = useI18n();
const { g2 } = useFormat();

function toneClass(tone: ItemStat['tone']): string {
  return {
    neutral: 'text-[var(--sz-text)]',
    success: 'text-[var(--sz-success-text)]',
    danger: 'text-[var(--sz-danger-text)]',
    warning: 'text-[var(--sz-warning-text)]',
  }[tone ?? 'neutral'];
}
</script>

<template>
  <button
    type="button"
    class="sz-hatch group relative flex min-h-[112px] w-full flex-col border border-[var(--sz-border)] bg-ink-800 p-2 text-left transition-[color,background-color,border-color,transform] duration-[120ms] hover:-translate-y-px hover:bg-ink-700 active:bg-ink-700 motion-reduce:transform-none"
    @dblclick="$emit('open')"
    @keydown.enter.prevent="$emit('open')"
  >
    <span class="flex items-center justify-between gap-2">
      <span class="sz-caps min-w-0 truncate text-[var(--sz-text-muted)]" :title="category ?? undefined">
        {{ category || '—' }}
      </span>
      <span class="flex shrink-0 items-center gap-1">
        <VirtualBadge v-if="virtual" />
        <RankBadge v-if="rank" :rank="rank" />
      </span>
    </span>
    <RarityName :name="name" :rank="rank" :level="level" class="mt-1" />

    <span class="my-2 flex min-h-[46px] flex-1 items-center justify-center">
      <img
        v-if="icon"
        :src="icon"
        :alt="name"
        class="max-h-14 w-full object-contain"
        :loading="priority ? 'eager' : 'lazy'"
        :fetchpriority="priority ? 'high' : undefined"
      >
      <ItemIconFallback v-else :size="32" />
    </span>

    <span v-if="description" class="mb-1 line-clamp-3 text-[11px] text-[var(--sz-text-muted)]">
      {{ description }}
    </span>

    <span
      class="flex items-baseline gap-2 border-t border-[var(--sz-border)] pt-1 text-[11px] text-[var(--sz-text-muted)]"
    >
      <span class="shrink-0 tabular-nums">{{ weight == null ? '—' : t('items.weightValue', { value: g2(weight) }) }}</span>
      <span v-if="stats?.length" class="flex min-w-0 flex-1 flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5">
        <span v-for="stat in stats" :key="`${stat.label}-${stat.value}`">
          <span class="tabular-nums" :class="toneClass(stat.tone)">{{ stat.value }}</span> {{ stat.label }}
        </span>
      </span>
    </span>
  </button>
</template>
