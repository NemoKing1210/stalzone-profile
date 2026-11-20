<script setup lang="ts">
import type { EquipmentRead, EquipmentSlot, InventoryItemRead, StorageRead } from '@profile/shared/contracts';

import type { ItemMenuAction } from '../../model/menu';
import { useGridDragContext } from './drag-context';
import ItemContextMenu from './ItemContextMenu.vue';

const props = withDefaults(
  defineProps<{
    equipment: EquipmentRead | null;
    /** Every storage, read by the slot context menu's "Move to" submenu. */
    storages?: StorageRead[];
    busy?: boolean;
    /** Registers a filled slot with the shared drag layer. */
    attachTile?: (el: HTMLElement | null, item: InventoryItemRead | null) => void;
  }>(),
  { storages: () => [], busy: false, attachTile: undefined },
);

const drag = useGridDragContext();

/** Equipment slot the current drag is hovering; only this component re-renders for it. */
const activeSlot = computed(() => {
  const target = drag?.target.value;
  return target?.location === 'equipment' ? target.slot : null;
});

defineEmits<{
  select: [item: InventoryItemRead];
  pick: [item: InventoryItemRead, event: KeyboardEvent];
  menu: [item: InventoryItemRead, action: ItemMenuAction];
}>();

const { t } = useI18n();
const { rankColor } = useFormat();

/** An empty slot shows either a lucide glyph or the quick-slot number; lucide has no digit icons. */
const SLOTS: { slot: EquipmentSlot; icon?: string; hotkey?: string; wide?: boolean }[] = [
  { slot: 'primary', icon: 'i-lucide-crosshair', wide: true },
  { slot: 'backpack', icon: 'i-lucide-backpack' },
  { slot: 'secondary', icon: 'i-lucide-crosshair', wide: true },
  { slot: 'armor', icon: 'i-lucide-shield' },
  { slot: 'melee', icon: 'i-lucide-sword', wide: true },
  { slot: 'container', icon: 'i-lucide-box' },
  { slot: 'quick1', hotkey: '1' },
  { slot: 'quick2', hotkey: '2' },
  { slot: 'quick3', hotkey: '3' },
  { slot: 'quick4', hotkey: '4' },
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
    <ItemContextMenu
      v-for="entry in SLOTS"
      :key="entry.slot"
      :item="itemIn(entry.slot)"
      :storages="props.storages"
      :equipment="props.equipment"
      :busy="props.busy"
      @action="itemIn(entry.slot) && $emit('menu', itemIn(entry.slot)!, $event)"
    >
      <button
        :ref="(el) => props.attachTile?.(el as HTMLElement | null, itemIn(entry.slot))"
        type="button"
        class="group relative flex min-h-[62px] touch-none select-none flex-col items-center justify-center gap-0.5 border bg-ink-800 p-1 text-center transition-colors"
        :class="[
          entry.wide ? 'col-span-2' : '',
          itemIn(entry.slot) ? 'hover:bg-ink-700' : '',
          activeSlot === entry.slot ? 'shadow-[inset_0_0_0_2px_var(--sz-accent)]' : '',
        ]"
        :style="{ borderColor: border(itemIn(entry.slot)) }"
        :data-drop="`equipment:${entry.slot}`"
        :aria-label="`${t(`inventory.slots.${entry.slot}`)}: ${itemIn(entry.slot)?.name ?? t('inventory.slotEmpty')}`"
        @click="itemIn(entry.slot) && $emit('select', itemIn(entry.slot)!)"
        @keydown.enter.prevent="itemIn(entry.slot) && $emit('pick', itemIn(entry.slot)!, $event)"
        @keydown.space.prevent="itemIn(entry.slot) && $emit('pick', itemIn(entry.slot)!, $event)"
      >
        <template v-if="itemIn(entry.slot)">
          <img
            v-if="itemIn(entry.slot)!.icon"
            :src="itemIn(entry.slot)!.icon!"
            :alt="itemIn(entry.slot)!.name"
            class="pointer-events-none h-8 max-w-full object-contain"
            loading="lazy"
            draggable="false"
          >
          <UIcon v-else :name="entry.icon ?? 'i-lucide-package'" class="size-5 text-[var(--sz-text-dim)]" />
          <span class="max-w-full truncate text-[10.5px] leading-tight text-[var(--sz-text)]">
            {{ itemIn(entry.slot)!.name }}
          </span>
          <span class="text-[10px] leading-none tabular-nums text-[var(--sz-text-muted)]">
            {{ t('items.level', { level: itemIn(entry.slot)!.level }) }}
          </span>
        </template>
        <template v-else>
          <span v-if="entry.hotkey" class="font-display text-[15px] leading-none tabular-nums text-[var(--sz-text-dim)]">
            {{ entry.hotkey }}
          </span>
          <UIcon v-else :name="entry.icon" class="size-4 text-[var(--sz-text-dim)]" />
          <span class="sz-caps text-[11px] leading-tight text-[var(--sz-text-dim)]">
            {{ t(`inventory.slots.${entry.slot}`) }}
          </span>
        </template>
      </button>
    </ItemContextMenu>
  </div>
</template>
