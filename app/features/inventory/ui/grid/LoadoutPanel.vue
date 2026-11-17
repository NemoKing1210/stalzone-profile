<script setup lang="ts">
import type { ContainerLoadout, EffectBreakdown, LoadoutStats, RangeValue } from '@profile/shared/contracts';

import { StatRow } from '~/shared/ui';

const props = withDefaults(
  defineProps<{
    stats: LoadoutStats | null;
    /** Container item id → display name, supplied by the page. */
    names?: Record<number, string>;
  }>(),
  { names: () => ({}) },
);

const { t } = useI18n();
const { g2 } = useFormat();

const PROTECTION_KEYS = new Set([
  'bullet',
  'tear',
  'explosion',
  'electric',
  'fire',
  'chem',
  'rad',
  'temp',
  'bio',
  'psy',
  'bleed',
  'stop',
  'frost',
]);

const WARNING_KINDS = new Set(['rarity', 'effectiveness', 'innerProtection', 'weight', 'storageWeight']);

function rangeOut(value: RangeValue | null | undefined): string {
  if (!value) return '—';
  if (value.value != null) return g2(value.value);
  if (value.min != null && value.max != null) return `${g2(value.min)}–${g2(value.max)}`;
  return '—';
}

function protectionLabel(key: string): string {
  return PROTECTION_KEYS.has(key) ? t(`inventory.protectionNames.${key}`) : key.replace(/_/g, ' ');
}

function effectLabel(key: string): string {
  return key.replace(/_/g, ' ');
}

function warningText(code: string): string {
  const [prefix, kind, ...rest] = code.split(':');
  const target = rest.join(':');
  if (prefix !== 'missing' || !kind || !WARNING_KINDS.has(kind)) return code;
  return t(`inventory.warning.${kind}`, { target: target || '—' });
}

/** An effect bucket with no value and no missing input carries no information. */
function hasBucket(bucket: RangeValue | null | undefined): boolean {
  if (!bucket) return false;
  return bucket.value != null || bucket.min != null || bucket.missing.length > 0;
}

function effectRows(effect: EffectBreakdown): { label: string; value: string; tone: 'success' | 'danger' | 'neutral' }[] {
  const rows: { label: string; value: string; tone: 'success' | 'danger' | 'neutral' }[] = [];
  if (hasBucket(effect.positive)) {
    rows.push({ label: t('inventory.positive'), value: rangeOut(effect.positive), tone: 'success' });
  }
  if (hasBucket(effect.negative)) {
    rows.push({ label: t('inventory.negative'), value: rangeOut(effect.negative), tone: 'danger' });
  }
  if (hasBucket(effect.purge)) {
    rows.push({ label: t('inventory.purge'), value: rangeOut(effect.purge), tone: 'neutral' });
  }
  return rows;
}

const protections = computed(() => Object.entries(props.stats?.protection ?? {}));
const effects = computed(() => Object.entries(props.stats?.effects ?? {}));
const containers = computed<ContainerLoadout[]>(() => props.stats?.containers ?? []);
const warnings = computed(() => props.stats?.warnings ?? []);

function containerName(container: ContainerLoadout): string {
  return props.names[container.itemId] ?? `#${container.itemId}`;
}

function innerEntries(container: ContainerLoadout): { key: string; value: number | null }[] {
  return Object.entries(container.innerProtection).map(([key, value]) => ({ key, value }));
}
</script>

<template>
  <div class="space-y-3 text-[12px]">
    <section v-if="protections.length" class="space-y-1">
      <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.protection') }}</h3>
      <div class="divide-y divide-[var(--sz-border)] border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2">
        <StatRow
          v-for="[key, value] in protections"
          :key="key"
          :label="protectionLabel(key)"
          :value="rangeOut(value)"
        />
      </div>
    </section>
    <p v-else class="text-[var(--sz-text-dim)]">{{ t('inventory.noProtection') }}</p>

    <section v-if="effects.length" class="space-y-1">
      <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.effects') }}</h3>
      <div class="space-y-1.5">
        <div
          v-for="[key, effect] in effects"
          :key="key"
          class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2 py-1"
        >
          <p class="truncate text-[11px] uppercase tracking-[0.08em] text-[var(--sz-text-muted)]">
            {{ effectLabel(key) }}
          </p>
          <StatRow
            v-for="row in effectRows(effect)"
            :key="row.label"
            :label="row.label"
            :value="row.value"
            :tone="row.tone"
          />
        </div>
      </div>
    </section>
    <p v-else class="text-[var(--sz-text-dim)]">{{ t('inventory.noEffects') }}</p>

    <section v-if="containers.length" class="space-y-1">
      <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.containers') }}</h3>
      <div
        v-for="container in containers"
        :key="container.itemId"
        class="space-y-0.5 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2 py-1"
      >
        <p class="flex items-baseline justify-between gap-2">
          <span class="min-w-0 truncate">{{ containerName(container) }}</span>
          <span class="shrink-0 tabular-nums text-[11px] text-[var(--sz-text-muted)]">
            {{ t('items.slotsValue', { slots: container.slots ?? '—', eff: container.effectiveness ?? '—' }) }}
          </span>
        </p>
        <p class="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-[var(--sz-text-muted)]">
          <span v-for="entry in innerEntries(container)" :key="entry.key">
            {{ protectionLabel(entry.key) }}
            <span class="tabular-nums text-[var(--sz-text)]">{{ entry.value == null ? '—' : entry.value }}</span>
          </span>
        </p>
      </div>
    </section>

    <section v-if="warnings.length" class="space-y-1">
      <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.warnings') }}</h3>
      <ul class="flex flex-wrap gap-1">
        <li
          v-for="code in warnings"
          :key="code"
          class="border border-[var(--sz-warning)] px-1.5 py-0.5 text-[10.5px] text-[var(--sz-warning-text)]"
        >
          {{ warningText(code) }}
        </li>
      </ul>
    </section>
  </div>
</template>
