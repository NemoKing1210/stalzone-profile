<script setup lang="ts">
import type { LoadoutStats, RangeValue, StorageRead } from '@profile/shared/contracts';

import { clampPercent } from '~/shared/lib/clampPercent';

import { storageLabel } from '../../model/labels';

const props = withDefaults(
  defineProps<{
    /** The character's carry stats; omit them for a storage-only hud. */
    stats?: LoadoutStats | null;
    storage?: StorageRead | null;
    /** The hud sits at one edge of a flush pane, so it draws only that separator. */
    edge?: 'top' | 'bottom';
  }>(),
  { stats: null, storage: null, edge: 'bottom' },
);

const { t } = useI18n();
const { g2 } = useFormat();

const carry = computed(() => props.stats?.carry ?? null);
const carried = computed<RangeValue | null>(() => carry.value?.carried ?? null);
const total = computed<RangeValue | null>(() => carry.value?.total ?? null);
const safeLimit = computed<RangeValue | null>(() => carry.value?.safeLimit ?? null);
const bonus = computed<RangeValue | null>(() => carry.value?.bonus ?? null);

/** A null value is "no data", never zero. Every weight prints its unit. */
function rangeOut(value: RangeValue | null | undefined): string {
  if (!value) return '—';
  if (value.value != null) return t('inventory.weightValue', { value: g2(value.value) });
  if (value.min != null && value.max != null) {
    return t('inventory.weightRange', { min: g2(value.min), max: g2(value.max) });
  }
  return '—';
}

function minOf(value: RangeValue | null | undefined): number | null {
  if (!value) return null;
  return value.min ?? value.value ?? null;
}

function maxOf(value: RangeValue | null | undefined): number | null {
  if (!value) return null;
  return value.max ?? value.value ?? null;
}

const tones = computed(() => {
  if (carry.value?.overweight) return 'text-[var(--sz-danger-text)]';
  if (carry.value?.aboveSafe) return 'text-[var(--sz-warning-text)]';
  return 'text-[var(--sz-text)]';
});

const barColor = computed(() => {
  if (carry.value?.overweight) return 'var(--sz-danger)';
  if (carry.value?.aboveSafe) return 'var(--sz-warning)';
  return 'var(--sz-accent)';
});

/** The bar's right edge: the capacity ceiling, widened by an actual overload. */
const scale = computed(() => {
  const top = Math.max(maxOf(total.value) ?? 0, maxOf(carried.value) ?? 0);
  return top > 0 ? top : null;
});

function percentOf(value: number | null): number | null {
  if (value == null || scale.value == null) return null;
  return clampPercent(value, scale.value);
}

const percent = computed(() => percentOf(maxOf(carried.value)) ?? 0);

/** Above the safe limit warns; above the capacity is an overload. */
const safeStart = computed(() => percentOf(minOf(safeLimit.value)));
const capacityStart = computed(() => percentOf(minOf(total.value)));
const capacityEnd = computed(() => percentOf(maxOf(total.value)));
const warningWidth = computed(() =>
  safeStart.value == null || capacityStart.value == null ? 0 : Math.max(0, capacityStart.value - safeStart.value),
);
/** Everything past the capacity floor is dangerous, including an overload past the ceiling. */
const dangerWidth = computed(() => (capacityStart.value == null ? 0 : Math.max(0, 100 - capacityStart.value)));

const storageWeight = computed(() => rangeOut(props.storage?.weight ?? null));
const storageMax = computed(() =>
  props.storage?.maxWeight == null ? '—' : t('inventory.weightValue', { value: g2(props.storage.maxWeight) }),
);
</script>

<template>
  <div
    class="space-y-1.5 bg-[var(--sz-surface-alt)] px-2.5 py-2"
    :class="edge === 'top' ? 'border-t border-[var(--sz-border)]' : 'border-b border-[var(--sz-border)]'"
  >
    <template v-if="carry">
      <div class="flex flex-wrap items-baseline justify-between gap-x-3">
        <span class="sz-caps text-[var(--sz-text-muted)]">{{ t('inventory.carried') }}</span>
        <span class="tabular-nums" :class="tones">
          {{ rangeOut(carried) }}
          <span class="text-[var(--sz-text-dim)]">/</span>
          {{ rangeOut(total) }}
        </span>
      </div>

      <!-- The ranges sit on the bar itself: where warning starts and where the load is full. -->
      <div class="relative h-3.5 text-[10px] leading-none tabular-nums">
        <span
          v-if="safeStart != null && safeLimit"
          class="absolute bottom-0 whitespace-nowrap pr-1 text-[var(--sz-warning-text)]"
          :style="{ left: `${safeStart}%`, transform: 'translateX(-100%)' }"
        >
          {{ rangeOut(safeLimit) }}
        </span>
        <span
          v-if="capacityEnd != null && total"
          class="absolute bottom-0 whitespace-nowrap pr-1 text-[var(--sz-danger-text)]"
          :style="{ left: `${capacityEnd}%`, transform: 'translateX(-100%)' }"
        >
          {{ rangeOut(total) }}
        </span>
      </div>

      <div
        class="relative h-2 w-full bg-ink-950"
        role="progressbar"
        :aria-valuenow="carried?.value ?? undefined"
        :aria-valuemin="0"
        :aria-valuemax="total?.value ?? total?.max ?? undefined"
        :aria-label="t('inventory.carried')"
      >
        <div
          v-if="warningWidth > 0"
          class="absolute inset-y-0 bg-[var(--sz-warning)]/20"
          :style="{ left: `${safeStart}%`, width: `${warningWidth}%` }"
        />
        <div
          v-if="dangerWidth > 0"
          class="absolute inset-y-0 bg-[var(--sz-danger)]/20"
          :style="{ left: `${capacityStart}%`, width: `${dangerWidth}%` }"
        />
        <div
          class="absolute inset-y-0 left-0 transition-[width] duration-150"
          :style="{ width: `${percent}%`, backgroundColor: barColor }"
        />
        <div
          v-if="safeStart != null"
          class="absolute inset-y-0 w-px bg-[var(--sz-warning)]"
          :style="{ left: `${safeStart}%` }"
        />
        <div
          v-if="capacityStart != null"
          class="absolute inset-y-0 w-px bg-[var(--sz-danger)]"
          :style="{ left: `${capacityStart}%` }"
        />
      </div>

      <div class="flex justify-end">
        <UPopover>
          <button
            type="button"
            class="inline-flex items-center gap-1 border border-[var(--sz-border)] px-1.5 py-0.5 text-[11px] text-[var(--sz-text-muted)] hover:text-[var(--sz-text)]"
          >
            <UIcon name="i-lucide-signature" class="size-3" />
            {{ t('inventory.breakdown') }}
          </button>
          <template #content>
            <dl class="w-64 divide-y divide-[var(--sz-border)] p-2 text-[12px]">
              <div class="flex justify-between gap-3 py-1">
                <dt class="text-[var(--sz-text-muted)]">{{ t('inventory.base') }}</dt>
                <dd class="tabular-nums">{{ t('inventory.weightValue', { value: g2(carry.base) }) }}</dd>
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
    </template>

    <div v-if="storage" class="flex flex-wrap items-baseline justify-between gap-x-3 text-[11px]">
      <span class="truncate text-[var(--sz-text-muted)]">{{ storageLabel(storage, t) }}</span>
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
