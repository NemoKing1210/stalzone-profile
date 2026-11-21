<script setup lang="ts">
import type { InventoryItemRead } from '@profile/shared/contracts';

import { effectiveSize } from '../../model/grid';
import { tileMeta } from '../../model/tileMeta';
import { itemEdgeColor } from '~/shared/lib/rankBorder';
import ItemTileBody from './ItemTileBody.vue';

const props = withDefaults(
  defineProps<{
    item: InventoryItemRead;
    picked?: boolean;
    /** Registers the tile with the drag layer; the tile itself moves under the pointer. */
    attach?: (el: HTMLElement | null, item: InventoryItemRead | null) => void;
  }>(),
  { picked: false, attach: undefined },
);

const emit = defineEmits<{ open: []; pick: [event: KeyboardEvent]; quick: [event: MouseEvent] }>();

const { t } = useI18n();

const size = computed(() => effectiveSize(props.item.size));
const meta = computed(() => tileMeta(props.item));

const label = computed(() =>
  [
    meta.value.name,
    meta.value.type,
    props.item.level > 0 ? `+${props.item.level}` : null,
    props.item.qty > 1 ? `×${props.item.qty}` : null,
    meta.value.attached ? t('inventory.attached', { count: meta.value.attached }) : null,
    meta.value.caliber,
  ]
    .filter(Boolean)
    .join(' · '),
);

/** The rank edge is a hint, not a frame: the card keeps its grid lines visible through it. */
const edge = computed(() => itemEdgeColor(props.item.rank));

/** Picked has to vanish while the drag copy flies; every resting tile keeps the same frame. */
const stateClass = computed(() => {
  if (props.picked) return 'invisible';
  return 'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]';
});

/** Shift + primary click is the one-cell quick move; a plain click still changes nothing. */
function click(event: MouseEvent): void {
  if (event.shiftKey && event.detail === 1) emit('quick', event);
}

let tileEl: HTMLElement | null = null;

/** A stable ref: Vue invokes it on mount and unmount, not on every re-render. */
function bindTile(el: unknown): void {
  if (el) {
    tileEl = el as HTMLElement;
    props.attach?.(tileEl, props.item);
    return;
  }
  if (tileEl) {
    props.attach?.(tileEl, null);
    tileEl = null;
  }
}

watch(
  () => props.item,
  (item) => {
    if (tileEl) props.attach?.(tileEl, item);
  },
);
</script>

<template>
  <button
    :ref="bindTile"
    type="button"
    class="sz-hatch group absolute flex touch-none select-none flex-col overflow-hidden border text-left transition-colors [container-type:inline-size] bg-ink-800/60 hover:bg-ink-700/85"
    :style="{ borderColor: edge }"
    :class="[stateClass, 'cursor-grab']"
    :aria-label="label"
    :title="`${meta.name}${meta.type ? ` · ${meta.type}` : ''}${item.qty > 1 ? ` ×${item.qty}` : ''}`"
    :data-size="`${size.width}x${size.height}`"
    draggable="false"
    @dragstart.prevent
    @click="click"
    @dblclick="$emit('open')"
    @keydown.enter.prevent="$emit('open')"
    @keydown.space.prevent="$emit('pick', $event)"
  >
    <ItemTileBody :item="item" />
  </button>
</template>
