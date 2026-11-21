<script setup lang="ts">
import type { ContainerLoadout, EffectBreakdown, LoadoutStats, RangeValue } from '@profile/shared/contracts';

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

/** One glyph per damage type; the label still carries the meaning, so colour is never alone. */
const PROTECTION_ICONS: Record<string, string> = {
  bullet: 'i-lucide-shield',
  tear: 'i-lucide-scissors',
  explosion: 'i-lucide-bomb',
  electric: 'i-lucide-zap',
  fire: 'i-lucide-flame',
  chem: 'i-lucide-flask-conical',
  rad: 'i-lucide-radiation',
  temp: 'i-lucide-thermometer',
  bio: 'i-lucide-biohazard',
  psy: 'i-lucide-brain',
  bleed: 'i-lucide-droplets',
  stop: 'i-lucide-hand',
  frost: 'i-lucide-snowflake',
};

const WARNING_KINDS = new Set(['rarity', 'effectiveness', 'innerProtection', 'weight', 'storageWeight']);

type Tone = 'success' | 'danger' | 'neutral';

const TONE_ICONS: Record<Tone, string> = {
  success: 'i-lucide-plus',
  danger: 'i-lucide-minus',
  neutral: 'i-lucide-eraser',
};

const TONE_TEXT: Record<Tone, string> = {
  success: 'text-[var(--sz-success-text)]',
  danger: 'text-[var(--sz-danger-text)]',
  neutral: 'text-[var(--sz-text-muted)]',
};

function rangeOut(value: RangeValue | null | undefined): string {
  if (!value) return '—';
  if (value.value != null) return g2(value.value);
  if (value.min != null && value.max != null) return `${g2(value.min)}–${g2(value.max)}`;
  return '—';
}

function protectionLabel(key: string): string {
  return PROTECTION_KEYS.has(key) ? t(`inventory.protectionNames.${key}`) : key.replace(/_/g, ' ');
}

function protectionIcon(key: string): string {
  return PROTECTION_ICONS[key] ?? 'i-lucide-shield';
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

function effectRows(effect: EffectBreakdown): { label: string; value: string; tone: Tone }[] {
  const rows: { label: string; value: string; tone: Tone }[] = [];
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
  <div class="space-y-3 text-[12px] [container-type:inline-size]">
    <section>
      <header class="mb-1.5 flex items-center gap-1.5">
        <UIcon name="i-lucide-shield-half" class="size-3.5 shrink-0 text-[var(--sz-text-dim)]" aria-hidden="true" />
        <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.protection') }}</h3>
      </header>
      <ul v-if="protections.length" class="grid grid-cols-2 gap-1 @min-[460px]:grid-cols-3">
        <li
          v-for="[key, value] in protections"
          :key="key"
          class="flex min-w-0 items-center gap-1.5 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-1.5 py-1"
        >
          <UIcon :name="protectionIcon(key)" class="size-3.5 shrink-0 text-[var(--sz-text-dim)]" aria-hidden="true" />
          <span class="min-w-0 flex-1 text-[11px] leading-tight text-[var(--sz-text-muted)]">
            {{ protectionLabel(key) }}
          </span>
          <span class="shrink-0 tabular-nums text-[11.5px] text-[var(--sz-text)]">{{ rangeOut(value) }}</span>
        </li>
      </ul>
      <p
        v-else
        class="flex items-center gap-1.5 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2 py-1.5 text-[11.5px] text-[var(--sz-text-dim)]"
      >
        <UIcon name="i-lucide-shield-off" class="size-3.5 shrink-0" aria-hidden="true" />
        {{ t('inventory.noProtection') }}
      </p>
    </section>

    <section>
      <header class="mb-1.5 flex items-center gap-1.5">
        <UIcon name="i-lucide-gem" class="size-3.5 shrink-0 text-[var(--sz-text-dim)]" aria-hidden="true" />
        <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.effects') }}</h3>
      </header>
      <div v-if="effects.length" class="grid gap-1 @min-[460px]:grid-cols-2">
        <div
          v-for="[key, effect] in effects"
          :key="key"
          class="min-w-0 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)]"
        >
          <p
            class="break-words border-b border-[var(--sz-border)] px-2 py-1 text-[11px] leading-tight text-[var(--sz-text-muted)]"
          >
            {{ effectLabel(key) }}
          </p>
          <ul class="divide-y divide-[var(--sz-border)]">
            <li v-for="row in effectRows(effect)" :key="row.label" class="flex items-center gap-1.5 px-2 py-0.5">
              <UIcon
                :name="TONE_ICONS[row.tone]"
                class="size-3.5 shrink-0"
                :class="TONE_TEXT[row.tone]"
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1 text-[11px] text-[var(--sz-text-muted)]">{{ row.label }}</span>
              <span class="shrink-0 tabular-nums text-[11.5px]" :class="TONE_TEXT[row.tone]">{{ row.value }}</span>
            </li>
          </ul>
        </div>
      </div>
      <p
        v-else
        class="flex items-center gap-1.5 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2 py-1.5 text-[11.5px] text-[var(--sz-text-dim)]"
      >
        <UIcon name="i-lucide-gem" class="size-3.5 shrink-0" aria-hidden="true" />
        {{ t('inventory.noEffects') }}
      </p>
    </section>

    <section v-if="containers.length">
      <header class="mb-1.5 flex items-center gap-1.5">
        <UIcon name="i-lucide-box" class="size-3.5 shrink-0 text-[var(--sz-text-dim)]" aria-hidden="true" />
        <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.containers') }}</h3>
      </header>
      <div class="grid gap-1 @min-[460px]:grid-cols-2">
        <div
          v-for="container in containers"
          :key="container.itemId"
          class="min-w-0 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2 py-1.5"
        >
          <p class="flex items-baseline justify-between gap-2">
            <span class="min-w-0 break-words">{{ containerName(container) }}</span>
            <span class="shrink-0 tabular-nums text-[10.5px] text-[var(--sz-text-muted)]">
              {{ t('items.slotsValue', { slots: container.slots ?? '—', eff: container.effectiveness ?? '—' }) }}
            </span>
          </p>
          <p class="mt-1 flex flex-wrap gap-x-2.5 gap-y-1">
            <span
              v-for="entry in innerEntries(container)"
              :key="entry.key"
              class="inline-flex items-center gap-1 text-[10.5px] leading-tight text-[var(--sz-text-muted)]"
            >
              <UIcon
                :name="protectionIcon(entry.key)"
                class="size-3 shrink-0 text-[var(--sz-text-dim)]"
                aria-hidden="true"
              />
              {{ protectionLabel(entry.key) }}
              <span class="tabular-nums text-[var(--sz-text)]">{{ entry.value == null ? '—' : entry.value }}</span>
            </span>
          </p>
        </div>
      </div>
    </section>

    <section v-if="warnings.length">
      <header class="mb-1.5 flex items-center gap-1.5">
        <UIcon
          name="i-lucide-triangle-alert"
          class="size-3.5 shrink-0 text-[var(--sz-warning-text)]"
          aria-hidden="true"
        />
        <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.warnings') }}</h3>
      </header>
      <ul class="flex flex-wrap gap-1">
        <li
          v-for="code in warnings"
          :key="code"
          class="inline-flex items-center gap-1 border border-[var(--sz-warning)] px-1.5 py-0.5 text-[10.5px] leading-tight text-[var(--sz-warning-text)]"
        >
          <UIcon name="i-lucide-triangle-alert" class="size-3 shrink-0" aria-hidden="true" />
          {{ warningText(code) }}
        </li>
      </ul>
    </section>
  </div>
</template>
