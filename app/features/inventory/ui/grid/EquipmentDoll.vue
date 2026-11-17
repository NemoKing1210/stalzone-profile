<script setup lang="ts">
import type { EquipmentRead, EquipmentSlot, InventoryItemRead } from '@profile/shared/contracts';

const props = withDefaults(
  defineProps<{
    equipment: EquipmentRead | null;
    /** Equipment slot the current drag is hovering, highlighted as a drop target. */
    activeSlot?: string | null;
  }>(),
  { activeSlot: null },
);

defineEmits<{
  select: [item: InventoryItemRead];
  press: [payload: { item: InventoryItemRead; event: PointerEvent }];
  pick: [item: InventoryItemRead, event: KeyboardEvent];
}>();

const { t } = useI18n();
const { rankColor } = useFormat();

const SLOTS: { slot: EquipmentSlot; icon: string; wide?: boolean }[] = [
  { slot: 'primary', icon: 'i-lucide-crosshair', wide: true },
  { slot: 'backpack', icon: 'i-lucide-backpack' },
  { slot: 'secondary', icon: 'i-lucide-crosshair', wide: true },
  { slot: 'armor', icon: 'i-lucide-shield' },
  { slot: 'melee', icon: 'i-lucide-sword', wide: true },
  { slot: 'container', icon: 'i-lucide-box' },
  { slot: 'quick1', icon: 'i-lucide-1' },
  { slot: 'quick2', icon: 'i-lucide-2' },
  { slot: 'quick3', icon: 'i-lucide-3' },
  { slot: 'quick4', icon: 'i-lucide-4' },
];

function itemIn(slot: EquipmentSlot): InventoryItemRead | null {
  return props.equipment?.[slot] ?? null;
}

function border(item: InventoryItemRead | null): string {
  return item ? (rankColor(item.rank) ?? 'var(--sz-border-strong)') : 'var(--sz-border)';
}
</script>

<template>
  <div class="grid grid-cols-3 gap-1">
    <button
      v-for="entry in SLOTS"
      :key="entry.slot"
      type="button"
      class="group relative flex min-h-[62px] flex-col items-center justify-center gap-0.5 border bg-ink-800 p-1 text-center transition-colors"
      :class="[
        entry.wide ? 'col-span-2' : '',
        itemIn(entry.slot) ? 'hover:bg-ink-700' : '',
        props.activeSlot === entry.slot ? 'shadow-[inset_0_0_0_2px_var(--sz-accent)]' : '',
      ]"
      :style="{ borderColor: border(itemIn(entry.slot)) }"
      :data-drop="`equipment:${entry.slot}`"
      :aria-label="`${t(`inventory.slots.${entry.slot}`)}: ${itemIn(entry.slot)?.name ?? t('inventory.slotEmpty')}`"
      @click="itemIn(entry.slot) && $emit('select', itemIn(entry.slot)!)"
      @pointerdown="itemIn(entry.slot) && $emit('press', { item: itemIn(entry.slot)!, event: $event })"
      @keydown.enter.prevent="itemIn(entry.slot) && $emit('pick', itemIn(entry.slot)!, $event)"
      @keydown.space.prevent="itemIn(entry.slot) && $emit('pick', itemIn(entry.slot)!, $event)"
    >
      <template v-if="itemIn(entry.slot)">
        <img
          v-if="itemIn(entry.slot)!.icon"
          :src="itemIn(entry.slot)!.icon!"
          :alt="itemIn(entry.slot)!.name"
          class="h-8 max-w-full object-contain"
          loading="lazy"
        >
        <UIcon v-else :name="entry.icon" class="size-5 text-[var(--sz-text-dim)]" />
        <span class="max-w-full truncate text-[10.5px] leading-tight text-[var(--sz-text)]">
          {{ itemIn(entry.slot)!.name }}
        </span>
        <span class="text-[10px] leading-none tabular-nums text-[var(--sz-text-muted)]">
          {{ t('items.level', { level: itemIn(entry.slot)!.level }) }}
        </span>
      </template>
      <template v-else>
        <UIcon :name="entry.icon" class="size-4 text-[var(--sz-text-dim)]" />
        <span class="sz-caps text-[9.5px] leading-tight text-[var(--sz-text-dim)]">
          {{ t(`inventory.slots.${entry.slot}`) }}
        </span>
      </template>
    </button>
  </div>
</template>
