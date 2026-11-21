<script setup lang="ts">
import type { StorageRead } from '@profile/shared/contracts';

import { ghostForGrid } from '../../model/grid';
import { useGridDragContext } from './drag-context';

const props = defineProps<{
  storage: StorageRead;
  enabled: boolean;
}>();

const drag = useGridDragContext();

/** The dashed landing preview; only what this grid draws is recomputed per pointer move. */
const ghost = computed(() => {
  if (!props.enabled || !drag) return null;
  const picked = drag.picked.value;
  const spot = drag.ghost.value;
  const target = drag.target.value;
  if (!picked || !spot || !target || target.location !== 'grid' || spot.storageId !== props.storage.id) return null;

  const items = props.storage.items.flatMap((item) =>
    item.placement.location === 'grid' ? [{ id: item.id, size: item.size, placement: item.placement }] : [],
  );
  return ghostForGrid(
    { width: props.storage.width, height: props.storage.height },
    picked,
    spot,
    items,
  );
});
</script>

<template>
  <div
    v-if="ghost"
    class="pointer-events-none absolute z-20 border-2"
    :class="
      ghost.valid
        ? 'border-[var(--sz-accent)]/40 bg-[var(--sz-accent)]/10'
        : 'border-[var(--sz-danger)]/40 bg-[var(--sz-danger)]/10'
    "
    :style="{
      left: `${(ghost.x / Math.max(1, props.storage.width)) * 100}%`,
      top: `${(ghost.y / Math.max(1, props.storage.height)) * 100}%`,
      width: `${(ghost.width / Math.max(1, props.storage.width)) * 100}%`,
      height: `${(ghost.height / Math.max(1, props.storage.height)) * 100}%`,
    }"
  />
</template>
