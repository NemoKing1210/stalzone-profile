<script setup lang="ts">
import { ItemIconFallback, RankBadge, RarityName } from '~/entities/item';
import { StatRow, StorageBar } from '~/shared/ui';

import type { ContainerPayload } from '~/shared/types/profile';

const props = defineProps<{ container: ContainerPayload | null }>();

defineEmits<{ artifact: [name: string, level: number] }>();

const { t } = useI18n();
const { g1, g2, num, formatDate, rankTextColor } = useFormat();

const equivalent = computed(() => {
  const container = props.container;
  if (!container || container.slots == null || container.eff == null) return '—';
  return g2((container.slots * container.eff) / 100);
});
</script>

<template>
  <div v-if="props.container" class="min-w-0 space-y-3">
    <div class="flex items-start gap-3">
      <img
        v-if="props.container.icon"
        :src="props.container.icon"
        :alt="props.container.name"
        class="size-12 shrink-0 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] object-contain p-1"
        loading="lazy"
      >
      <div
        v-else
        class="flex size-12 shrink-0 items-center justify-center border border-[var(--sz-border)] bg-[var(--sz-surface-alt)]"
      >
        <ItemIconFallback :size="24" />
      </div>
      <div class="min-w-0 flex-1 space-y-1">
        <p><RarityName :name="props.container.name" :rank="props.container.rank" size="lg" /></p>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ props.container.type ?? t('containers.typeFallback') }}
          <span v-if="props.container.bonus"> · {{ props.container.bonus }}</span>
        </p>
        <RankBadge :rank="props.container.rank" />
      </div>
    </div>

    <div class="divide-y divide-[var(--sz-border)] border-y border-[var(--sz-border)]">
      <StatRow :label="t('containers.slots')" :value="props.container.slots ?? null" />
      <StatRow
        :label="t('containers.efficiency')"
        :value="props.container.eff == null ? null : `${g1(props.container.eff)}%`"
      />
      <StatRow :label="t('containers.equivalent')" :value="equivalent" />
      <StatRow
        :label="t('containers.weight')"
        :value="props.container.weight == null
          ? null
          : t('containers.weightValue', { value: g2(props.container.weight) })"
      />
    </div>

    <div class="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
      <span>
        <span class="text-[var(--sz-text-muted)]">{{ t('containers.protection') }}</span>
        {{ props.container.prot ?? '—' }}
      </span>
      <span>
        <span class="text-[var(--sz-text-muted)]">{{ t('containers.shield') }}</span>
        {{ props.container.shield ?? '—' }}
      </span>
    </div>

    <StorageBar
      v-if="props.container.slots != null"
      :label="t('containers.fillTitle')"
      :value="props.container.artifacts.length"
      :max="props.container.slots"
    />

    <div>
      <p class="sz-caps mb-1.5 text-[11px] text-[var(--sz-text-muted)]">{{ t('containers.fillTitle') }}</p>
      <ul v-if="props.container.artifacts.length" class="flex flex-wrap gap-1">
        <li v-for="(entry, index) in props.container.artifacts" :key="`${entry.name}-${index}`">
          <button
            type="button"
            class="inline-flex items-baseline gap-1 whitespace-nowrap border border-[var(--sz-border)] px-1.5 py-0.5 text-[11px] hover:border-[var(--sz-accent)] hover:bg-[var(--sz-surface-alt)] active:bg-[var(--sz-surface-alt)]"
            :style="{ color: rankTextColor(null) }"
            @click="$emit('artifact', entry.name, entry.lvl)"
          >
            {{ entry.name }}
            <span class="tabular-nums text-[var(--sz-text-muted)]">+{{ entry.lvl }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('containers.fillEmpty') }}</p>
      <p v-if="props.container.artifactsAsOf" class="mt-1 text-[12px] text-[var(--sz-text-dim)]">
        {{ t('containers.fillAsOf', { date: formatDate(props.container.artifactsAsOf) }) }}
      </p>
    </div>

    <p v-if="props.container.slots != null && props.container.eff != null" class="text-[12px] text-[var(--sz-text-dim)]">
      {{
        t('containers.formula', {
          slots: num(props.container.slots),
          eff: g1(props.container.eff),
          value: equivalent,
        })
      }}
    </p>
  </div>
  <p v-else class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('containers.noSelection') }}</p>
</template>
