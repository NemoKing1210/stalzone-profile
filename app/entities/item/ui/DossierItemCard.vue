<script setup lang="ts">
import RankBadge from './RankBadge.vue';
import RarityName from './RarityName.vue';

interface ItemStat {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'danger' | 'warning';
}

const props = withDefaults(
  defineProps<{
    name: string;
    rank?: string | null;
    category?: string | null;
    level?: number | null;
    icon?: string | null;
    stats?: ItemStat[];
    description?: string;
    selected?: boolean;
    priority?: boolean;
  }>(),
  { selected: false, priority: false },
);

defineEmits<{ select: [] }>();

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
    class="group relative flex min-h-[112px] w-full flex-col border border-[var(--sz-border)] bg-ink-800 p-2 text-left transition-colors hover:bg-ink-700 active:bg-ink-700"
    :class="selected ? 'shadow-[inset_0_0_0_1px_var(--sz-accent)]' : ''"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <span v-if="selected" class="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-[var(--sz-accent)]" />
    <span class="flex items-center justify-between gap-2">
      <span class="sz-caps min-w-0 truncate text-[var(--sz-text-muted)]" :title="category ?? undefined">
        {{ category || '—' }}
      </span>
      <RankBadge v-if="rank" :rank="rank" class="shrink-0" />
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
      <UIcon v-else name="i-lucide-package" class="size-8 text-[var(--sz-text-dim)]" />
    </span>

    <span v-if="description" class="mb-1 line-clamp-3 text-[11px] text-[var(--sz-text-muted)]">
      {{ description }}
    </span>

    <span
      v-if="stats?.length"
      class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-t border-[var(--sz-border)] pt-1 text-[11px] text-[var(--sz-text-muted)]"
    >
      <span v-for="stat in stats" :key="stat.label">
        <span class="tabular-nums" :class="toneClass(stat.tone)">{{ stat.value }}</span> {{ stat.label }}
      </span>
    </span>
  </button>
</template>
