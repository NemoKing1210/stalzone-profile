<script setup lang="ts">
import ItemTile from './ItemTile.vue';
import { useGridDragContext } from './drag-context';

defineProps<{
  /** `payload.details`, so the carried card shows the same type and caliber as the grid. */
  details?: Record<string, unknown> | null;
}>();

const drag = useGridDragContext();
const item = computed(() => drag?.picked.value ?? null);
const box = computed(() => drag?.preview.value ?? null);
const rotated = computed(() => drag?.rotated.value ?? false);
</script>

<template>
  <!-- The carried tile itself: real size, under the pointer, above every pane. -->
  <Teleport to="body">
    <div
      v-if="item && box"
      class="pointer-events-none fixed z-[1200]"
      :style="{
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }"
    >
      <ItemTile
        :item="item"
        :details="details"
        :rotated="rotated"
        class="cursor-grabbing shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
        :style="{ position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' }"
      />
    </div>
  </Teleport>
</template>
