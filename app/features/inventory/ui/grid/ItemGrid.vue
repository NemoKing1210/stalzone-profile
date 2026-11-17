<script setup lang="ts">
import type { InventoryItemRead, StorageRead } from '@profile/shared/contracts';

import { effectiveSize, type GridGhostPreview } from '../../model/grid';
import ItemTile from './ItemTile.vue';

const props = withDefaults(
  defineProps<{
    storage: StorageRead | null;
    selectedId?: number | null;
    emptyText?: string;
    ghost?: GridGhostPreview | null;
  }>(),
  { selectedId: null, emptyText: undefined, ghost: null },
);

defineEmits<{
  select: [item: InventoryItemRead];
  press: [payload: { item: InventoryItemRead; event: PointerEvent }];
  pick: [item: InventoryItemRead, event: KeyboardEvent];
}>();

const { t } = useI18n();

const columns = computed(() => Math.max(1, props.storage?.width ?? 8));
const rows = computed(() => Math.max(1, props.storage?.height ?? 8));
const placed = computed(() =>
  (props.storage?.items ?? []).filter((item) => item.placement.location === 'grid'),
);

const box = computed(() => ({
  '--sz-cell': 'clamp(28px, 4.2vw, 56px)',
  width: `calc(var(--sz-cell) * ${columns.value})`,
  height: `calc(var(--sz-cell) * ${rows.value})`,
  backgroundImage:
    'linear-gradient(to right, var(--sz-border) 1px, transparent 1px), linear-gradient(to bottom, var(--sz-border) 1px, transparent 1px)',
  backgroundSize: `calc(100% / ${columns.value}) calc(100% / ${rows.value})`,
}));

function styleFor(item: InventoryItemRead): Record<string, string> {
  const placement = item.placement;
  if (placement.location !== 'grid') return {};
  return cells(placement.x, placement.y, effectiveSize(item.size, placement.rotated));
}

function cells(x: number, y: number, size: { width: number; height: number }): Record<string, string> {
  return {
    left: `${(x / columns.value) * 100}%`,
    top: `${(y / rows.value) * 100}%`,
    width: `${(size.width / columns.value) * 100}%`,
    height: `${(size.height / rows.value) * 100}%`,
  };
}

const ghostStyle = computed(() => (props.ghost ? cells(props.ghost.x, props.ghost.y, props.ghost) : null));
</script>

<template>
  <div class="w-full overflow-auto">
    <div
      class="relative border border-[var(--sz-border-strong)] bg-ink-950"
      :style="box"
      :data-drop="props.storage ? `grid:${props.storage.id}` : undefined"
    >
      <div
        v-if="props.ghost && ghostStyle"
        class="pointer-events-none z-20 border-2"
        :class="props.ghost.valid ? 'border-[var(--sz-accent)] bg-[var(--sz-accent)]/15' : 'border-[var(--sz-danger)] bg-[var(--sz-danger)]/15'"
        :style="ghostStyle"
      />

      <ItemTile
        v-for="item in placed"
        :key="item.id"
        :item="item"
        :selected="item.id === props.selectedId"
        :rotated="item.placement.location === 'grid' && item.placement.rotated"
        :style="styleFor(item)"
        @select="$emit('select', item)"
        @press="$emit('press', { item, event: $event })"
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
