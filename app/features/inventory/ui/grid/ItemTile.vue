<script setup lang="ts">
import type { InventoryItemRead } from '@profile/shared/contracts';

import { effectiveSize } from '../../model/grid';

const props = withDefaults(
  defineProps<{
    item: InventoryItemRead;
    selected?: boolean;
    picked?: boolean;
    rotated?: boolean;
    /** Registers the tile with the drag layer; the tile itself moves under the pointer. */
    attach?: (el: HTMLElement | null, item: InventoryItemRead | null) => void;
  }>(),
  { selected: false, picked: false, rotated: false, attach: undefined },
);

defineEmits<{ select: []; pick: [event: KeyboardEvent] }>();

const { t } = useI18n();
const { rankColor } = useFormat();

const border = computed(() => rankColor(props.item.rank) ?? 'var(--sz-border-strong)');
const size = computed(() => effectiveSize(props.item.size, props.rotated));
const artifacts = computed(() => props.item.artifacts?.length ?? 0);
const modules = computed(() => props.item.modules?.length ?? 0);
const label = computed(() =>
  [props.item.name, t('items.level', { level: props.item.level }), props.item.qty > 1 ? `×${props.item.qty}` : null]
    .filter(Boolean)
    .join(' · '),
);

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
    class="group absolute flex touch-none select-none items-center justify-center overflow-hidden border bg-ink-800 p-0.5 text-center transition-colors hover:bg-ink-700"
    :style="{ borderColor: border }"
    :class="[
      selected ? 'z-10 shadow-[inset_0_0_0_1px_var(--sz-accent)]' : '',
      // The source stays out of sight while its floating copy carries the item.
      picked ? 'invisible' : '',
      'cursor-grab',
    ]"
    :aria-label="label"
    :title="item.name"
    :data-size="`${size.width}x${size.height}`"
    draggable="false"
    @dragstart.prevent
    @click="$emit('select')"
    @keydown.enter.prevent="$emit('pick', $event)"
    @keydown.space.prevent="$emit('pick', $event)"
  >
    <img
      v-if="item.icon"
      :src="item.icon"
      :alt="item.name"
      class="pointer-events-none max-h-full max-w-full object-contain"
      loading="lazy"
      draggable="false"
    >
    <UIcon v-else name="i-lucide-package" class="pointer-events-none size-1/2 text-[var(--sz-text-dim)]" />

    <span
      v-if="item.level > 0"
      class="pointer-events-none absolute left-0.5 top-0.5 border border-[var(--sz-border)] bg-ink-950/85 px-1 text-[11px] font-medium tabular-nums leading-[1.35] text-[var(--sz-text-muted)]"
    >
      {{ item.level }}
    </span>

    <span
      v-if="item.qty > 1"
      class="sz-image-label pointer-events-none absolute bottom-0.5 right-1 text-[11px] font-medium tabular-nums leading-none text-[var(--sz-text)]"
    >
      ×{{ item.qty }}
    </span>

    <span
      v-if="artifacts || modules"
      class="pointer-events-none absolute right-0.5 top-0.5 flex items-center gap-0.5 border border-[var(--sz-border)] bg-ink-950/85 px-1 text-[11px] leading-[1.35] text-[var(--sz-text-muted)]"
    >
      <UIcon :name="artifacts ? 'i-lucide-gem' : 'i-lucide-paperclip'" class="size-2.5" />
      {{ artifacts || modules }}
    </span>
  </button>
</template>
