<script setup lang="ts">
import type { LoadoutStats, RangeValue, StorageRead } from '@profile/shared/contracts';

import { clampPercent } from '~/shared/lib/clampPercent';

const props = withDefaults(
  defineProps<{
    stats: LoadoutStats | null;
    storage?: StorageRead | null;
  }>(),
  { storage: null },
);

const { t } = useI18n();
const { g2 } = useFormat();

const carry = computed(() => props.stats?.carry ?? null);
const carried = computed<RangeValue | null>(() => carry.value?.carried ?? null);
const total = computed<RangeValue | null>(() => carry.value?.total ?? null);
const safeLimit = computed<RangeValue | null>(() => carry.value?.safeLimit ?? null);
const bonus = computed<RangeValue | null>(() => carry.value?.bonus ?? null);

/** A null value is "no data", never zero. A real range prints as `min / max`. */
function rangeOut(value: RangeValue | null | undefined): string {
  if (!value) return '—';
  if (value.value != null) return g2(value.value);
  if (value.min != null && value.max != null) return `${g2(value.min)} / ${g2(value.max)}`;
  return '—';
}

const tones = computed(() => {
  if (carry.value?.overweight) return 'text-[var(--sz-danger-text)]';
  if (carry.value?.aboveSafe) return 'text-[var(--sz-warning-text)]';
  return 'text-[var(--sz-text)]';
});

const percent = computed(() => {
  if (carried.value?.value == null || !total.value?.value) return 0;
  return clampPercent(carried.value.value, total.value.value);
});

const barColor = computed(() => {
  if (carry.value?.overweight) return 'var(--sz-danger)';
  if (carry.value?.aboveSafe) return 'var(--sz-warning)';
  return 'var(--sz-accent)';
});

const storageWeight = computed(() => rangeOut(props.storage?.weight ?? null));
const storageMax = computed(() =>
  props.storage?.maxWeight == null ? '—' : g2(props.storage.maxWeight),
);
</script>

<template>
  <div class="space-y-1.5 border-b border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2.5 py-2">
    <div class="flex flex-wrap items-baseline justify-between gap-x-3">
      <span class="sz-caps text-[var(--sz-text-muted)]">{{ t('inventory.carried') }}</span>
      <span class="tabular-nums" :class="tones">
        {{ rangeOut(carried) }}
        <span class="text-[var(--sz-text-dim)]">/</span>
        {{ rangeOut(total) }}
      </span>
    </div>

    <div
      class="h-[4px] w-full bg-ink-950"
      role="progressbar"
      :aria-valuenow="carried?.value ?? undefined"
      :aria-valuemin="0"
      :aria-valuemax="total?.value ?? undefined"
      :aria-label="t('inventory.carried')"
    >
      <div
        class="h-full origin-left transition-transform"
        :style="{ width: '100%', transform: `scaleX(${percent / 100})`, backgroundColor: barColor }"
      />
    </div>

    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-[var(--sz-text-muted)]">
      <span>
        {{ t('inventory.safeLimit') }}:
        <span class="tabular-nums text-[var(--sz-text)]">{{ rangeOut(safeLimit) }}</span>
      </span>
      <span v-if="total && (total.min != null || total.max != null)">
        {{ t('inventory.range') }}:
        <span class="tabular-nums text-[var(--sz-text)]">
          {{ total.min == null ? '—' : g2(total.min) }} / {{ total.max == null ? '—' : g2(total.max) }}
        </span>
      </span>

      <UPopover v-if="carry">
        <button
          type="button"
          class="ml-auto inline-flex items-center gap-1 border border-[var(--sz-border)] px-1.5 py-0.5 text-[11px] text-[var(--sz-text-muted)] hover:text-[var(--sz-text)]"
        >
          <UIcon name="i-lucide-signature" class="size-3" />
          {{ t('inventory.breakdown') }}
        </button>
        <template #content>
          <dl class="w-64 divide-y divide-[var(--sz-border)] p-2 text-[12px]">
            <div class="flex justify-between gap-3 py-1">
              <dt class="text-[var(--sz-text-muted)]">{{ t('inventory.base') }}</dt>
              <dd class="tabular-nums">{{ g2(carry.base) }}</dd>
            </div>
            <div class="flex justify-between gap-3 py-1">
              <dt class="text-[var(--sz-text-muted)]">{{ t('inventory.bonus') }}</dt>
              <dd class="tabular-nums">{{ rangeOut(bonus) }}</dd>
            </div>
            <div class="flex justify-between gap-3 py-1">
              <dt class="text-[var(--sz-text-muted)]">{{ t('inventory.carry') }}</dt>
              <dd class="tabular-nums">{{ rangeOut(total) }}</dd>
            </div>
            <div class="flex justify-between gap-3 py-1">
              <dt class="text-[var(--sz-text-muted)]">{{ t('inventory.safeLimit') }}</dt>
              <dd class="tabular-nums">{{ rangeOut(safeLimit) }}</dd>
            </div>
            <div class="flex justify-between gap-3 py-1">
              <dt class="text-[var(--sz-text-muted)]">{{ t('inventory.carried') }}</dt>
              <dd class="tabular-nums">{{ rangeOut(carried) }}</dd>
            </div>
            <div v-if="carried?.missing.length" class="py-1">
              <dt class="text-[var(--sz-text-muted)]">{{ t('inventory.missing') }}</dt>
              <dd class="mt-1 flex flex-wrap gap-1">
                <span
                  v-for="entry in carried.missing"
                  :key="entry"
                  class="border border-[var(--sz-border)] px-1 py-0.5 text-[11px]"
                >
                  {{ entry }}
                </span>
              </dd>
            </div>
          </dl>
        </template>
      </UPopover>
    </div>

    <div v-if="storage" class="flex flex-wrap items-baseline justify-between gap-x-3 text-[11px]">
      <span class="truncate text-[var(--sz-text-muted)]">{{ storage.name }}</span>
      <span class="tabular-nums">
        {{ storageWeight }}
        <span v-if="storage.maxWeight != null" class="text-[var(--sz-text-dim)]">/ {{ storageMax }}</span>
      </span>
    </div>

    <div v-if="carry?.overweight || carry?.aboveSafe" class="flex flex-wrap gap-1">
      <span
        v-if="carry.overweight"
        class="border border-[var(--sz-danger)] px-1.5 py-0.5 text-[11px] text-[var(--sz-danger-text)]"
      >
        {{ t('inventory.overweight') }}
      </span>
      <span
        v-if="carry.aboveSafe"
        class="border border-[var(--sz-warning)] px-1.5 py-0.5 text-[11px] text-[var(--sz-warning-text)]"
      >
        {{ t('inventory.aboveSafe') }}
      </span>
    </div>
  </div>
</template>
