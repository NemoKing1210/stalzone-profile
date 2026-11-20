<script setup lang="ts">
import type { EquipmentRead, EquipmentSlot, InventoryItemRead, StorageRead } from '@profile/shared/contracts';

import { EQUIPMENT_GRID, equipmentLayout } from '../../model/equipmentLayout';
import { highlightedSlots } from '../../model/slotHighlights';
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

const emit = defineEmits<{
  open: [item: InventoryItemRead];
  pick: [item: InventoryItemRead, event: KeyboardEvent];
  menu: [item: InventoryItemRead, action: ItemMenuAction];
}>();

const drag = useGridDragContext();

/** Equipment slot the current drag is hovering; only this component re-renders for it. */
const activeSlot = computed(() => {
  const target = drag?.target.value;
  return target?.location === 'equipment' ? target.slot : null;
});
/** Every compatible slot lights up for the item currently being dragged. */
const compatibleSlots = computed(() => new Set(highlightedSlots(drag?.picked.value ?? null)));

const { t } = useI18n();
const { rankColor } = useFormat();

/** An empty slot shows either a lucide glyph or the quick-slot number; lucide has no digit icons. */
const SLOT_ICONS: Record<EquipmentSlot, { icon?: string; hotkey?: string }> = {
  primary: { icon: 'i-lucide-crosshair' },
  secondary: { icon: 'i-lucide-crosshair' },
  melee: { icon: 'i-lucide-sword' },
  armor: { icon: 'i-lucide-shield' },
  backpack: { icon: 'i-lucide-backpack' },
  container: { icon: 'i-lucide-box' },
  quick1: { hotkey: '1' },
  quick2: { hotkey: '2' },
  quick3: { hotkey: '3' },
  quick4: { hotkey: '4' },
};

const cells = computed(() => equipmentLayout(props.equipment));
const dollStyle = computed(() => ({
  gridTemplateColumns: `repeat(${EQUIPMENT_GRID.columns}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${EQUIPMENT_GRID.rows}, minmax(0, 1fr))`,
  aspectRatio: `${EQUIPMENT_GRID.columns} / ${EQUIPMENT_GRID.rows}`,
}));

function itemIn(slot: EquipmentSlot): InventoryItemRead | null {
  return props.equipment?.[slot] ?? null;
}

function cellStyle(cell: { x: number; y: number; width: number; height: number }): Record<string, string> {
  return {
    gridColumn: `${cell.x + 1} / span ${cell.width}`,
    gridRow: `${cell.y + 1} / span ${cell.height}`,
  };
}

function gesture(item: InventoryItemRead | null): void {
  if (item) emit('open', item);
}

function border(item: InventoryItemRead | null): string {
  return item ? (rankColor(item.rank) ?? 'var(--sz-border-strong)') : 'var(--sz-border)';
}
</script>

<template>
  <div class="grid w-full gap-1" :style="dollStyle">
    <div
      v-for="cell in cells"
      :key="cell.slot"
      class="min-h-0 min-w-0"
      :style="cellStyle(cell)"
    >
      <ItemContextMenu
        :item="itemIn(cell.slot)"
        :storages="props.storages"
        :equipment="props.equipment"
        :busy="props.busy"
        @action="itemIn(cell.slot) && emit('menu', itemIn(cell.slot)!, $event)"
      >
        <button
          :ref="(el) => props.attachTile?.(el as HTMLElement | null, itemIn(cell.slot))"
          type="button"
          class="group relative flex h-full w-full touch-none select-none flex-col items-center justify-center overflow-hidden border bg-ink-800 text-center transition-colors"
          :class="[
            itemIn(cell.slot) ? 'hover:bg-ink-700' : '',
            compatibleSlots.has(cell.slot) ? 'bg-[color-mix(in_srgb,var(--sz-accent)_10%,transparent)]' : '',
            compatibleSlots.has(cell.slot) && !itemIn(cell.slot)
              ? 'ring-1 ring-inset ring-[var(--sz-accent)]/60'
              : '',
            activeSlot === cell.slot ? 'shadow-[inset_0_0_0_2px_var(--sz-accent)]' : '',
          ]"
          :style="{ borderColor: border(itemIn(cell.slot)) }"
          :data-drop="`equipment:${cell.slot}`"
          :data-size="itemIn(cell.slot) ? `${itemIn(cell.slot)!.size.width}x${itemIn(cell.slot)!.size.height}` : undefined"
          :aria-label="`${t(`inventory.slots.${cell.slot}`)}: ${itemIn(cell.slot)?.name ?? t('inventory.slotEmpty')}`"
          @dblclick="gesture(itemIn(cell.slot))"
          @keydown.enter.prevent="itemIn(cell.slot) && emit('open', itemIn(cell.slot)!)"
          @keydown.space.prevent="itemIn(cell.slot) && emit('pick', itemIn(cell.slot)!, $event)"
        >
          <template v-if="itemIn(cell.slot)">
            <img
              v-if="itemIn(cell.slot)!.icon"
              :src="itemIn(cell.slot)!.icon!"
              :alt="itemIn(cell.slot)!.name"
              class="pointer-events-none absolute inset-0 h-full w-full object-contain p-1"
              loading="lazy"
              draggable="false"
            >
            <UIcon
              v-else
              :name="SLOT_ICONS[cell.slot].icon ?? 'i-lucide-package'"
              class="size-1/2 text-[var(--sz-text-dim)]"
            />
            <span
              class="absolute inset-x-0 bottom-0 truncate bg-ink-950/80 px-1 py-0.5 text-[10.5px] leading-tight text-[var(--sz-text)]"
            >
              {{ itemIn(cell.slot)!.name }}
            </span>
            <span
              v-if="itemIn(cell.slot)!.level > 0"
              class="absolute right-0.5 top-0.5 bg-ink-950/80 px-1 text-[10px] leading-tight tabular-nums text-[var(--sz-success-text)]"
            >
              +{{ itemIn(cell.slot)!.level }}
            </span>
          </template>
          <template v-else>
            <span
              v-if="SLOT_ICONS[cell.slot].hotkey"
              class="font-display text-[15px] leading-none tabular-nums text-[var(--sz-text-dim)]"
            >
              {{ SLOT_ICONS[cell.slot].hotkey }}
            </span>
            <UIcon v-else :name="SLOT_ICONS[cell.slot].icon" class="size-4 text-[var(--sz-text-dim)]" />
            <span class="sz-caps max-w-full truncate px-1 text-[10px] leading-tight text-[var(--sz-text-dim)]">
              {{ t(`inventory.slots.${cell.slot}`) }}
            </span>
          </template>
        </button>
      </ItemContextMenu>
    </div>
  </div>
</template>
