<script setup lang="ts">

import type { InventoryItemRead, ModificationSlot } from '@profile/shared/contracts';
import { modificationSlotFor } from '@profile/shared/modifications';


import { ItemIconFallback, VirtualBadge } from '~/entities/item';
import { useGridDragContext } from './drag-context';

const props = withDefaults(
  defineProps<{
    weapon: InventoryItemRead;
    /** Owned modifications anywhere in the inventory; the panel filters by slot. */
    modifications?: InventoryItemRead[];
    busy?: boolean;
  }>(),
  { modifications: () => [], busy: false },
);

const drag = useGridDragContext();

/** The modification slot the drag is hovering on this weapon, read without the page. */
const activeSlot = computed(() => {
  const target = drag?.target.value;
  return target?.location === 'weapon_modification' && target.weaponItemId === props.weapon.id ? target.slot : null;
});

const emit = defineEmits<{
  install: [slot: ModificationSlot, modificationItemId: number | null];
  close: [];
}>();

const { t } = useI18n();
const { g2, num } = useFormat();

const SLOTS: { slot: ModificationSlot; icon: string }[] = [
  { slot: 'scope', icon: 'i-lucide-crosshair' },
  { slot: 'muzzle', icon: 'i-lucide-wind' },
  { slot: 'grip', icon: 'i-lucide-grip' },
  { slot: 'magazine', icon: 'i-lucide-layers' },
  { slot: 'stock', icon: 'i-lucide-ruler' },
  { slot: 'tactical', icon: 'i-lucide-flashlight' },
  { slot: 'other', icon: 'i-lucide-paperclip' },
];

const selectedSlot = ref<ModificationSlot>('scope');

const card = computed(() => props.weapon.card ?? null);

const BASE_STATS: { key: string; label: string; digits: number }[] = [
  { key: 'weight', label: 'items.fields.weight', digits: 2 },
  { key: 'caliber', label: 'items.fields.caliber', digits: 0 },
  { key: 'mag', label: 'items.fields.mag', digits: 0 },
  { key: 'rof', label: 'items.fields.rof', digits: 0 },
  { key: 'dps15', label: 'items.fields.dps15', digits: 0 },
  { key: 'ttk15', label: 'items.fields.ttk15', digits: 0 },
  { key: 'recoil', label: 'items.fields.recoil', digits: 0 },
  { key: 'ergonomics', label: 'items.fields.ergonomics', digits: 0 },
];

function baseValue(key: string, digits: number): string {
  if (key === 'weight') return props.weapon.weight == null ? '—' : g2(props.weapon.weight);
  const raw = card.value?.[key];
  if (typeof raw === 'number') return digits ? g2(raw) : num(raw);
  if (typeof raw === 'string' && raw) return raw;
  return '—';
}

const baseRows = computed(() =>
  BASE_STATS.map((stat) => ({ label: t(stat.label), value: baseValue(stat.key, stat.digits) })),
);

function installed(slot: ModificationSlot): InventoryItemRead | null {
  return (props.weapon.modifications ?? []).find(
    (modification) =>
      modification.placement.location === 'weapon_modification' && modification.placement.slot === slot,
  ) ?? null;
}

function candidates(slot: ModificationSlot): InventoryItemRead[] {
  const current = installed(slot);
  return props.modifications.filter(
    (modification) =>
      modification.id !== current?.id && modificationSlotFor(modification.category) === slot,
  );
}

const slotCandidates = computed(() => candidates(selectedSlot.value));

function badge(slot: ModificationSlot): number {
  return installed(slot) ? 1 : 0;
}

function isVerified(item: InventoryItemRead): boolean {
  return item.placement.location === 'weapon_modification' && item.placement.verified;
}
</script>

<template>
  <div class="space-y-3">
    <header class="flex items-center gap-2">
      <img v-if="props.weapon.icon" :src="props.weapon.icon" :alt="props.weapon.name" class="h-9 w-9 object-contain" loading="lazy">
      <ItemIconFallback v-else :size="24" />
      <div class="min-w-0">
        <p class="flex min-w-0 items-center gap-1 truncate text-[13px]"><span class="truncate">{{ props.weapon.name }}</span><VirtualBadge v-if="props.weapon.virtual" /></p>
        <p class="text-[11px] text-[var(--sz-text-muted)]">
          {{ props.weapon.category ?? t('items.kind.weapon') }} · {{ t('items.level', { level: props.weapon.level }) }}
        </p>
      </div>
    </header>

    <section class="space-y-1">
      <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.baseStats') }}</h3>
      <dl class="grid grid-cols-2 gap-x-3 gap-y-0.5 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2 py-1 text-[11.5px]">
        <div v-for="row in baseRows" :key="row.label" class="flex items-baseline justify-between gap-2">
          <dt class="truncate text-[var(--sz-text-muted)]">{{ row.label }}</dt>
          <dd class="shrink-0 tabular-nums">{{ row.value }}</dd>
        </div>
      </dl>
    </section>

    <section class="space-y-1">
      <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.modificationSlots') }}</h3>
      <div class="grid grid-cols-4 gap-1">
        <button
          v-for="entry in SLOTS"
          :key="entry.slot"
          type="button"
          class="relative flex min-h-[46px] flex-col items-center justify-center gap-0.5 border bg-ink-800 p-1 text-center transition-colors hover:bg-ink-700"
          :class="[
            selectedSlot === entry.slot ? 'border-[var(--sz-accent)]' : 'border-[var(--sz-border)]',
            activeSlot === entry.slot ? 'shadow-[inset_0_0_0_2px_var(--sz-accent)]' : '',
          ]"
          :data-drop="`modification:${props.weapon.id}:${entry.slot}`"
          :aria-label="t(`inventory.modification.${entry.slot}`)"
          @click="selectedSlot = entry.slot"
        >
          <UIcon :name="entry.icon" class="size-4 text-[var(--sz-text-dim)]" />
          <span class="sz-caps text-[9px] leading-tight text-[var(--sz-text-muted)]">
            {{ t(`inventory.modification.${entry.slot}`) }}
          </span>
          <span
            v-if="badge(entry.slot)"
            class="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-[var(--sz-success)]"
          />
        </button>
      </div>
    </section>

    <section class="space-y-1">
      <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">
        {{ t(`inventory.modification.${selectedSlot}`) }}
      </h3>

      <div
        v-if="installed(selectedSlot)"
        class="flex items-center justify-between gap-2 border border-[var(--sz-border-strong)] bg-[var(--sz-surface-alt)] px-2 py-1"
      >
        <span class="flex min-w-0 items-center gap-1.5">
          <img
            v-if="installed(selectedSlot)!.icon"
            :src="installed(selectedSlot)!.icon!"
            :alt="installed(selectedSlot)!.name"
            class="h-5 w-5 object-contain"
            loading="lazy"
          >
          <ItemIconFallback v-else :size="20" />
          <span class="truncate text-[12px]">{{ installed(selectedSlot)!.name }}</span>
          <VirtualBadge v-if="installed(selectedSlot)!.virtual" />
          <span
            v-if="!isVerified(installed(selectedSlot)!)"
            class="shrink-0 border border-[var(--sz-warning)] px-1 text-[11px] text-[var(--sz-warning-text)]"
          >
            {{ t('inventory.unverified') }}
          </span>
        </span>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          :aria-label="t('inventory.removeModification')"
          :disabled="props.busy"
          @click="emit('install', selectedSlot, null)"
        />
      </div>
      <p v-else class="border border-dashed border-[var(--sz-border)] px-2 py-1 text-[11.5px] text-[var(--sz-text-dim)]">
        {{ t('inventory.slotEmpty') }}
      </p>

      <div v-if="slotCandidates.length" class="flex flex-wrap gap-1">
        <button
          v-for="modification in slotCandidates"
          :key="modification.id"
          type="button"
          class="flex items-center gap-1 border border-[var(--sz-border)] bg-ink-800 px-1.5 py-0.5 text-[11px] hover:bg-ink-700 disabled:opacity-50"
          :title="modification.name"
          :disabled="props.busy"
          @click="emit('install', selectedSlot, modification.id)"
        >
          <img
            v-if="modification.icon"
            :src="modification.icon"
            :alt="modification.name"
            class="h-4 w-4 object-contain"
            loading="lazy"
          >
          <ItemIconFallback v-else :size="12" />
          {{ modification.name }}
          <VirtualBadge v-if="modification.virtual" />
        </button>
      </div>
      <p v-else class="text-[12px] text-[var(--sz-text-dim)]">{{ t('inventory.noModifications') }}</p>
      <p class="text-[10.5px] text-[var(--sz-text-dim)]">{{ t('inventory.compatHint') }}</p>
    </section>
  </div>
</template>
