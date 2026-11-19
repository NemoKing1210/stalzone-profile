<script setup lang="ts">
import type { InventoryItemRead, StorageRead } from '@profile/shared/contracts';

import { effectiveSize } from '../../model/grid';
import GridGhost from './GridGhost.vue';
import ItemTile from './ItemTile.vue';

const props = withDefaults(
  defineProps<{
    storage: StorageRead | null;
    selectedId?: number | null;
    emptyText?: string;
    /** Intake is read-only: no drop target and no ghost. */
    dropEnabled?: boolean;
    pickedId?: number | null;
    /** Registers each tile with the shared drag layer. */
    attachTile?: (el: HTMLElement | null, item: InventoryItemRead | null) => void;
  }>(),
  {
    selectedId: null,
    emptyText: undefined,
    dropEnabled: true,
    pickedId: null,
    attachTile: undefined,
  },
);

defineEmits<{
  select: [item: InventoryItemRead];
  pick: [item: InventoryItemRead, event: KeyboardEvent];
}>();

const { t } = useI18n();

const columns = computed(() => Math.max(1, props.storage?.width ?? 8));
const rows = computed(() => Math.max(1, props.storage?.height ?? 8));
const placed = computed(() =>
  (props.storage?.items ?? []).filter((item) => item.placement.location === 'grid'),
);

/** Cells divide the block evenly; the aspect ratio keeps them square, whatever the width. */
const box = computed(() => ({
  width: '100%',
  aspectRatio: `${columns.value} / ${rows.value}`,
  backgroundImage:
    'linear-gradient(to right, var(--sz-border) 1px, transparent 1px), linear-gradient(to bottom, var(--sz-border) 1px, transparent 1px)',
  backgroundSize: `calc(100% / ${columns.value}) calc(100% / ${rows.value})`,
}));

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

      <ItemTile
        v-for="item in placed"
        :key="item.id"
        :item="item"
        :selected="item.id === props.selectedId"
        :picked="item.id === props.pickedId"
        :rotated="item.placement.location === 'grid' && item.placement.rotated"
        :attach="props.attachTile"
        :style="styleFor(item)"
        @select="$emit('select', item)"
        @pick="$emit('pick', item, $event)"
      />

      <p
        v-if="!placed.length"
        class="pointer-events-none absolute inset-0 flex items-center justify-center p-3 text-center text-[11.5px] text-[var(--sz-text-dim)]"
      >
        {{ emptyText ?? t('inventory.emptyGrid') }}
      </p>
    </div>
  </div>
</template>
