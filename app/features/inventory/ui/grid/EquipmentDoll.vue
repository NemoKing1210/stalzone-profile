<script setup lang="ts">
import type { EquipmentRead, EquipmentSlot, InventoryItemRead, StorageRead } from '@profile/shared/contracts';

import { EQUIPMENT_GRID, equipmentLayout } from '../../model/equipmentLayout';
import { highlightedSlots } from '../../model/slotHighlights';
import { tileMeta } from '../../model/tileMeta';
import type { ItemMenuAction } from '../../model/menu';
import { itemEdgeColor } from '~/shared/lib/rankBorder';
import { useGridDragContext } from './drag-context';
import ItemContextMenu from './ItemContextMenu.vue';
import ItemTileBody from './ItemTileBody.vue';

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
  quick: [item: InventoryItemRead, event: MouseEvent];
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

/** Shift + primary click on a filled slot is the quick move; an empty slot ignores it. */
function click(item: InventoryItemRead | null, event: MouseEvent): void {
  if (item && event.shiftKey && event.detail === 1) emit('quick', item, event);
}

/**
 * A filled slot is the same card as an inventory tile: hatch, rank edge, item name, class,
 * icon and footer. An empty slot is a target — the hatch is absent and corner brackets mark
 * where a dragged item can land.
 */
function slotClasses(item: InventoryItemRead | null, slot: EquipmentSlot): string[] {
  const compatible = compatibleSlots.value.has(slot);
  const active = activeSlot.value === slot;
  const classes = [
    'group relative flex h-full w-full touch-none select-none flex-col overflow-hidden border transition-colors',
  ];
  classes.push(compatible ? 'bg-[color-mix(in_srgb,var(--sz-accent)_10%,transparent)]' : '');
  if (item) {
    classes.push('sz-hatch text-left [container-type:size]');
    classes.push(
      compatible
        ? 'hover:bg-[color-mix(in_srgb,var(--sz-accent)_14%,transparent)]'
        : 'bg-ink-800/60 hover:bg-ink-700/85',
    );
  } else {
    classes.push('items-center justify-center text-center');
    classes.push(compatible ? '' : 'bg-ink-900/40 hover:bg-ink-800/70');
  }
  if (compatible) classes.push('ring-1 ring-inset ring-[var(--sz-accent)]/60');
  if (active) classes.push('shadow-[inset_0_0_0_2px_var(--sz-accent)]');
  return classes;
}

/** The slot name is part of the accessible name; quick-slot digits are not spoken. */
function slotLabel(slot: EquipmentSlot, item: InventoryItemRead | null): string {
  const meta = item ? tileMeta(item) : null;
  const name = meta ? `${meta.name}${item && item.level > 0 ? ` +${item.level}` : ''}` : t('inventory.slotEmpty');
  return `${t(`inventory.slots.${slot}`)}: ${name}`;
}
</script>

<template>
  <div class="grid w-full gap-1" :style="dollStyle">
    <div v-for="cell in cells" :key="cell.slot" class="min-h-0 min-w-0" :style="cellStyle(cell)">
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
          class="min-h-0 min-w-0"
          :class="slotClasses(itemIn(cell.slot), cell.slot)"
          :style="{
            borderColor: itemIn(cell.slot) ? itemEdgeColor(itemIn(cell.slot)!.rank) : 'var(--sz-border)',
          }"
          :data-drop="`equipment:${cell.slot}`"
          :data-size="
            itemIn(cell.slot) ? `${itemIn(cell.slot)!.size.width}x${itemIn(cell.slot)!.size.height}` : undefined
          "
          :aria-label="slotLabel(cell.slot, itemIn(cell.slot))"
          :title="slotLabel(cell.slot, itemIn(cell.slot))"
          @click="click(itemIn(cell.slot), $event)"
          @dblclick="gesture(itemIn(cell.slot))"
          @keydown.enter.prevent="itemIn(cell.slot) && emit('open', itemIn(cell.slot)!)"
          @keydown.space.prevent="itemIn(cell.slot) && emit('pick', itemIn(cell.slot)!, $event)"
        >
          <template v-if="itemIn(cell.slot)">
            <ItemTileBody :item="itemIn(cell.slot)!" dense />
            <!-- Below 88px the body folds its class row away with the level in it. -->
            <span
              v-if="itemIn(cell.slot)!.level > 0"
              class="sz-slot-compact absolute bottom-0.5 right-0.5 z-10 bg-ink-950/75 px-1 text-[10px] leading-tight tabular-nums text-[var(--sz-success-text)]"
              aria-hidden="true"
            >
              +{{ itemIn(cell.slot)!.level }}
            </span>
            <!-- A quick slot keeps its digit while filled: it is the key, not the item label. -->
            <span
              v-if="SLOT_ICONS[cell.slot].hotkey"
              class="pointer-events-none absolute bottom-0 left-0 z-10 bg-ink-950/75 px-1 text-[10px] leading-tight tabular-nums text-[var(--sz-text-muted)]"
              aria-hidden="true"
            >
              {{ SLOT_ICONS[cell.slot].hotkey }}
            </span>
          </template>
          <template v-else>
            <span
              class="pointer-events-none absolute inset-1.5 opacity-40"
              :class="
                compatibleSlots.has(cell.slot) || activeSlot === cell.slot
                  ? 'text-[var(--sz-accent)] opacity-100'
                  : 'text-[var(--sz-text-dim)]'
              "
              aria-hidden="true"
            >
              <span class="absolute left-0 top-0 size-1.5 border-l border-t border-current" />
              <span class="absolute right-0 top-0 size-1.5 border-r border-t border-current" />
              <span class="absolute bottom-0 left-0 size-1.5 border-b border-l border-current" />
              <span class="absolute bottom-0 right-0 size-1.5 border-b border-r border-current" />
            </span>
            <span
              v-if="SLOT_ICONS[cell.slot].hotkey"
              class="font-display text-[15px] leading-none tabular-nums"
              :class="compatibleSlots.has(cell.slot) ? 'text-[var(--sz-accent)]' : 'text-[var(--sz-text-dim)]'"
            >
              {{ SLOT_ICONS[cell.slot].hotkey }}
            </span>
            <UIcon
              v-else
              :name="SLOT_ICONS[cell.slot].icon"
              class="size-4"
              :class="compatibleSlots.has(cell.slot) ? 'text-[var(--sz-accent)]' : 'text-[var(--sz-text-dim)]'"
            />
            <span
              v-if="!SLOT_ICONS[cell.slot].hotkey"
              class="sz-caps max-w-full truncate px-1 text-[10px] leading-tight"
              :class="compatibleSlots.has(cell.slot) ? 'text-[var(--sz-accent)]' : 'text-[var(--sz-text-dim)]'"
            >
              {{ t(`inventory.slots.${cell.slot}`) }}
            </span>
          </template>
        </button>
      </ItemContextMenu>
    </div>
  </div>
</template>

<style scoped>
/* On a short weapon well the class row (and its level) folds away; this chip keeps the
   refinement visible without printing it twice on a tall card. */
.sz-slot-compact {
  display: none;
}

@container (max-height: 87px) {
  .sz-slot-compact {
    display: inline-block;
  }
}
</style>
