<script setup lang="ts">
import type { InventoryItemRead } from '@profile/shared/contracts';

import { findDetailsCard } from '~/entities/item/model/details';

import { effectiveSize } from '../../model/grid';

const props = withDefaults(
  defineProps<{
    item: InventoryItemRead;
    /** `payload.details`: the catalog card behind the instance, read for type and caliber. */
    details?: Record<string, unknown> | null;
    picked?: boolean;
    rotated?: boolean;
    /** Registers the tile with the drag layer; the tile itself moves under the pointer. */
    attach?: (el: HTMLElement | null, item: InventoryItemRead | null) => void;
  }>(),
  { details: null, picked: false, rotated: false, attach: undefined },
);

defineEmits<{ open: []; pick: [event: KeyboardEvent] }>();

const { t } = useI18n();
const { rankColor, rankTextColor } = useFormat();

/** Card keys are prefixed by kind in `payload.details` (`cardKey` in core). */
const DETAIL_PREFIX: Record<string, string> = { weapon: 'w', armor: 'a', artifact: 'art', container: 'c' };

const size = computed(() => effectiveSize(props.item.size, props.rotated));
const name = computed(() => props.item.displayName ?? props.item.name);
const rank = computed(() => rankColor(props.item.rank));
const nameColor = computed(() => rankTextColor(props.item.rank));
const artifacts = computed(() => props.item.artifacts?.length ?? 0);
const modules = computed(() => props.item.modules?.length ?? 0);
const attached = computed(() => artifacts.value || modules.value);

const card = computed(() => findDetailsCard(props.details, DETAIL_PREFIX[props.item.kind] ?? '', props.item.name));
const type = computed(() => {
  // Weapons carry their class in `type`, armor carries it in `cls`; other kinds stay plain.
  const raw = props.item.kind === 'weapon' ? card.value?.type : props.item.kind === 'armor' ? card.value?.cls : null;
  return typeof raw === 'string' && raw.trim() ? raw : null;
});
const caliber = computed(() => {
  if (props.item.kind !== 'weapon') return null;
  const raw = card.value?.caliber;
  return typeof raw === 'string' && raw.trim() ? raw : null;
});

const label = computed(() =>
  [
    name.value,
    type.value,
    props.item.level > 0 ? `+${props.item.level}` : null,
    props.item.qty > 1 ? `×${props.item.qty}` : null,
    attached.value ? t('inventory.attached', { count: attached.value }) : null,
    caliber.value,
  ]
    .filter(Boolean)
    .join(' · '),
);

/** The rank edge is a hint, not a frame: the card keeps its grid lines visible through it. */
const edge = computed(() => (rank.value ? `${rank.value}b3` : 'var(--sz-border-strong)'));

/** Picked has to vanish while the drag copy flies; every resting tile keeps the same frame. */
const stateClass = computed(() => {
  if (props.picked) return 'invisible';
  return 'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]';
});

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
    class="group absolute flex touch-none select-none flex-col overflow-hidden border text-left transition-colors [container-type:inline-size] bg-ink-800/60 hover:bg-ink-700/85"
    :style="{ borderColor: edge }"
    :class="[stateClass, 'cursor-grab']"
    :aria-label="label"
    :title="`${name}${type ? ` · ${type}` : ''}${item.qty > 1 ? ` ×${item.qty}` : ''}`"
    :data-size="`${size.width}x${size.height}`"
    draggable="false"
    @dragstart.prevent
    @dblclick="$emit('open')"
    @keydown.enter.prevent="$emit('open')"
    @keydown.space.prevent="$emit('pick', $event)"
  >
    <!-- Name on top, then the class and refinement; the icon keeps whatever height is left. -->
    <span
      class="relative flex min-w-0 shrink-0 items-baseline gap-1 px-[5%] pt-[2px] text-[clamp(16px,24cqi,22px)] leading-[1.1]"
    >
      <span v-if="item.qty > 1" class="shrink-0 font-semibold tabular-nums text-[var(--sz-text)]">×{{ item.qty }}</span>
      <span class="min-w-0 flex-1 truncate font-medium" :style="{ color: nameColor }">{{ name }}</span>
    </span>

    <span
      v-if="type || item.level > 0"
      class="hidden shrink-0 items-baseline justify-between gap-1 px-[5%] pt-[1px] text-[clamp(16px,20cqi,19px)] uppercase leading-[1.15] tracking-[0.08em] text-[var(--sz-text-muted)] @min-[72px]:flex"
    >
      <span class="min-w-0 truncate">{{ type }}</span>
      <span v-if="item.level > 0" class="shrink-0 font-semibold normal-case tabular-nums tracking-normal text-[var(--sz-success-text)]">
        +{{ item.level }}
      </span>
    </span>

    <span class="pointer-events-none relative flex min-h-0 flex-1 items-center justify-center px-[6%] py-[1px]">
      <img
        v-if="item.icon"
        :src="item.icon"
        :alt="item.name"
        class="max-h-full max-w-full object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]"
        loading="lazy"
        draggable="false"
      >
      <UIcon v-else name="i-lucide-package" class="size-2/5 text-[var(--sz-text-dim)]" />
    </span>

    <!-- Footer: contents left, ammo type right. Both fold away on the smallest cells. -->
    <span
      v-if="attached || caliber"
      class="pointer-events-none hidden shrink-0 items-center justify-between gap-1 px-[5%] pb-[2px] text-[clamp(16px,20cqi,19px)] leading-[1.15] @min-[72px]:flex"
    >
      <span v-if="attached" class="flex min-w-0 items-center gap-0.5 text-[var(--sz-text-muted)]">
        <UIcon :name="artifacts ? 'i-lucide-gem' : 'i-lucide-paperclip'" class="size-[1.1em] shrink-0" />
        {{ attached }}
      </span>
      <span v-if="caliber" class="ml-auto truncate tabular-nums text-[var(--sz-text-dim)]">
        {{ caliber }}
      </span>
    </span>
  </button>
</template>
