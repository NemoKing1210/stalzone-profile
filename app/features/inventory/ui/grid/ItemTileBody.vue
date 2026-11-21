<script setup lang="ts">
import type { InventoryItemRead } from '@profile/shared/contracts';

import { ItemIconFallback, VirtualBadge } from '~/entities/item';
import { tileMeta } from '../../model/tileMeta';

const props = defineProps<{ item: InventoryItemRead; dense?: boolean }>();

const { rankTextColor } = useFormat();

const meta = computed(() => tileMeta(props.item));
const nameColor = computed(() => rankTextColor(props.item.rank));
</script>

<template>
  <span class="pointer-events-none flex min-h-0 w-full flex-1 flex-col">
    <!-- Name on top, then the class and refinement; the icon keeps whatever height is left. -->
    <span
      class="relative flex min-w-0 shrink-0 items-baseline gap-1 px-[5%] pt-[2px] leading-[1.1]"
      :class="dense ? 'text-[clamp(13px,17cqi,22px)]' : 'text-[clamp(16px,24cqi,22px)]'"
    >
      <span v-if="item.qty > 1" class="shrink-0 font-semibold tabular-nums text-[var(--sz-text)]">×{{ item.qty }}</span>
      <span
        class="min-w-0 flex-1 font-medium"
        :class="dense ? 'line-clamp-2' : 'truncate'"
        :style="{ color: nameColor }"
        >{{ meta.name }}</span
      >
      <VirtualBadge v-if="item.virtual" />
    </span>

    <span
      v-if="meta.type || item.level > 0"
      class="hidden shrink-0 items-baseline justify-between gap-1 px-[5%] pt-[1px] uppercase leading-[1.15] tracking-[0.08em] text-[var(--sz-text-muted)]"
      :class="[dense ? 'text-[clamp(12px,15cqi,19px)] sz-slot-meta' : 'text-[clamp(16px,20cqi,19px)] @min-[72px]:flex']"
    >
      <span class="min-w-0 truncate">{{ meta.type }}</span>
      <span
        v-if="item.level > 0"
        class="shrink-0 font-semibold normal-case tabular-nums tracking-normal text-[var(--sz-success-text)]"
      >
        +{{ item.level }}
      </span>
    </span>

    <span class="relative flex min-h-0 flex-1 items-center justify-center px-[6%] py-[1px]">
      <img
        v-if="item.icon"
        :src="item.icon"
        :alt="item.name"
        class="max-h-full max-w-full object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]"
        loading="lazy"
        draggable="false"
      >
      <ItemIconFallback v-else size="45%" />
    </span>

    <!-- Footer: contents left, ammo type right. Both fold away on the smallest cells. -->
    <span
      v-if="meta.attached || meta.caliber"
      class="hidden shrink-0 items-center justify-between gap-1 px-[5%] pb-[2px] leading-[1.15]"
      :class="[dense ? 'text-[clamp(12px,15cqi,19px)] sz-slot-meta' : 'text-[clamp(16px,20cqi,19px)] @min-[72px]:flex']"
    >
      <span v-if="meta.attached" class="flex min-w-0 items-center gap-0.5 text-[var(--sz-text-muted)]">
        <UIcon :name="meta.artifacts ? 'i-lucide-gem' : 'i-lucide-paperclip'" class="size-[1.1em] shrink-0" />
        {{ meta.attached }}
      </span>
      <span v-if="meta.caliber" class="ml-auto truncate tabular-nums text-[var(--sz-text-dim)]">
        {{ meta.caliber }}
      </span>
    </span>
  </span>
</template>

<style scoped>
/* A two-row weapon well is only 64-80px high on phones; the class and footer rows read
   better folded away there than squeezed around a 4px icon. The slot button is a size
   container, so the decision is the slot's real height, not the viewport's. */
@container (min-height: 88px) {
  .sz-slot-meta {
    display: flex;
  }
}
</style>
