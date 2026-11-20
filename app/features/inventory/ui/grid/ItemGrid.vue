<script setup lang="ts">
import type { EquipmentRead, InventoryItemRead, StorageRead } from '@profile/shared/contracts';

import { containerFilterActive, matchesContainerFilter, type ContainerFilter } from '../../model/containerFilters';
import { effectiveSize } from '../../model/grid';
import type { ItemMenuAction } from '../../model/menu';
import GridGhost from './GridGhost.vue';
import ItemContextMenu from './ItemContextMenu.vue';
import ItemTile from './ItemTile.vue';

const props = withDefaults(
  defineProps<{
    storage: StorageRead | null;
    selectedId?: number | null;
    emptyText?: string;
    /** Intake is read-only: no drop target and no ghost. */
    dropEnabled?: boolean;
    pickedId?: number | null;
    /** Every storage, read by the tile context menu's "Move to" submenu. */
    storages?: StorageRead[];
    /** Equipment slots, read by the tile context menu's "Equip" action. */
    equipment?: EquipmentRead | null;
    busy?: boolean;
    /** `payload.details`: type and caliber for the tiles that show them. */
    details?: Record<string, unknown> | null;
    /** Registers each tile with the shared drag layer. */
    attachTile?: (el: HTMLElement | null, item: InventoryItemRead | null) => void;
    /** Fixed cell size in pixels; the carried grid and the stash share one width. */
    cell?: number | null;
    /** View-only filter; hidden items keep their occupied cells. */
    filter?: ContainerFilter | null;
  }>(),
  {
    selectedId: null,
    emptyText: undefined,
    dropEnabled: true,
    pickedId: null,
    storages: () => [],
    equipment: null,
    busy: false,
    details: null,
    attachTile: undefined,
    cell: null,
    filter: null,
  },
);

defineEmits<{
  select: [item: InventoryItemRead];
  open: [item: InventoryItemRead];
  pick: [item: InventoryItemRead, event: KeyboardEvent];
  menu: [item: InventoryItemRead, action: ItemMenuAction];
}>();

const { t } = useI18n();

const columns = computed(() => Math.max(1, props.storage?.width ?? 8));
const rows = computed(() => Math.max(1, props.storage?.height ?? 8));
const placed = computed(() =>
  (props.storage?.items ?? []).filter((item) => item.placement.location === 'grid'),
);
const filterActive = computed(() => (props.filter ? containerFilterActive(props.filter) : false));
const hiddenPlaced = computed(() =>
  filterActive.value && props.filter
    ? placed.value.filter((item) => !matchesContainerFilter(item, props.filter!))
    : [],
);
const visiblePlaced = computed(() => {
  if (!filterActive.value || !props.filter) return placed.value;
  return placed.value.filter((item) => matchesContainerFilter(item, props.filter!));
});

/** Cells divide the block evenly; the aspect ratio keeps them square, whatever the width. */
const box = computed(() => {
  const gridLines =
    'linear-gradient(to right, var(--sz-border) 1px, transparent 1px), linear-gradient(to bottom, var(--sz-border) 1px, transparent 1px)';
  if (props.cell) {
    return {
      width: `${columns.value * props.cell}px`,
      height: `${rows.value * props.cell}px`,
      backgroundImage: gridLines,
      backgroundSize: `${props.cell}px ${props.cell}px`,
    };
  }
  return {
    width: '100%',
    aspectRatio: `${columns.value} / ${rows.value}`,
    backgroundImage: gridLines,
    backgroundSize: `calc(100% / ${columns.value}) calc(100% / ${rows.value})`,
  };
});

/** Style objects are reused per geometry, so an unchanged tile keeps its prop identity. */
const styleCache = new Map<string, Record<string, string>>();

function styleFor(item: InventoryItemRead): Record<string, string> {
  const placement = item.placement;
  if (placement.location !== 'grid') return {};
  const size = effectiveSize(item.size, placement.rotated);
  const key = `${placement.x}:${placement.y}:${size.width}:${size.height}:${columns.value}:${rows.value}`;
  const cached = styleCache.get(key);
  if (cached) return cached;
  const style = cells(placement.x, placement.y, size);
  styleCache.set(key, style);
  return style;
}

function cells(x: number, y: number, size: { width: number; height: number }): Record<string, string> {
  return {
    left: `${(x / columns.value) * 100}%`,
    top: `${(y / rows.value) * 100}%`,
    width: `${(size.width / columns.value) * 100}%`,
    height: `${(size.height / rows.value) * 100}%`,
  };
}

</script>

<template>
  <div class="w-full overflow-auto">
    <div
      class="relative border border-[var(--sz-border-strong)] bg-ink-950"
      :style="box"
      :data-drop="props.storage && props.dropEnabled ? `grid:${props.storage.id}` : undefined"
    >
      <GridGhost v-if="props.storage" :storage="props.storage" :enabled="props.dropEnabled" />

      <!-- A hidden item still owns its cells: a quiet hatch shows occupancy without leaking its card. -->
      <div
        v-for="item in hiddenPlaced"
        :key="`hidden-${item.id}`"
        class="pointer-events-none absolute border border-dashed border-[var(--sz-border-strong)] bg-ink-800/50 opacity-60"
        :style="styleFor(item)"
        aria-hidden="true"
      />

      <ItemContextMenu
        v-for="item in visiblePlaced"
        :key="item.id"
        :item="item"
        :storages="props.storages"
        :equipment="props.equipment"
        :busy="props.busy"
        @action="$emit('menu', item, $event)"
      >
        <ItemTile
          :item="item"
          :details="props.details"
          :selected="item.id === props.selectedId"
          :picked="item.id === props.pickedId"
          :rotated="item.placement.location === 'grid' && item.placement.rotated"
          :attach="props.attachTile"
          :style="styleFor(item)"
          @select="$emit('select', item)"
          @open="$emit('open', item)"
          @pick="$emit('pick', item, $event)"
        />
      </ItemContextMenu>

      <p
        v-if="!visiblePlaced.length"
        class="pointer-events-none absolute inset-0 flex items-center justify-center p-3 text-center text-[11.5px] text-[var(--sz-text-dim)]"
      >
        {{ filterActive ? t('inventory.filter.noMatch') : (emptyText ?? t('inventory.emptyGrid')) }}
      </p>
    </div>
  </div>
</template>
