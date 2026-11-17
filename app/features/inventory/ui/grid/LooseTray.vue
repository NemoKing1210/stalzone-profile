<script setup lang="ts">
import type { InventoryItemRead } from '@profile/shared/contracts';

const props = withDefaults(
  defineProps<{
    items: InventoryItemRead[];
    /** The storage auto-arrange packs into; `null` disables the button. */
    targetName?: string | null;
    busy?: boolean;
    /** The current drag hovers this target. */
    active?: boolean;
  }>(),
  { targetName: null, busy: false, active: false },
);

defineEmits<{
  select: [item: InventoryItemRead];
  press: [payload: { item: InventoryItemRead; event: PointerEvent }];
  pick: [item: InventoryItemRead, event: KeyboardEvent];
  arrange: [];
}>();

const { t } = useI18n();
const { rankColor } = useFormat();

function border(item: InventoryItemRead): string {
  return rankColor(item.rank) ?? 'var(--sz-border)';
}
</script>

<template>
  <section
    class="space-y-2 border p-2 transition-colors"
    :class="props.active ? 'border-[var(--sz-accent)] bg-ink-800' : 'border-transparent'"
    data-drop="loose"
  >
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="sz-caps text-[11px] text-[var(--sz-text-muted)] [overflow-wrap:break-word]">
        {{ t('inventory.loose') }}
        <span class="tabular-nums">({{ props.items.length }})</span>
      </h2>
      <UButton
        v-if="props.items.length"
        icon="i-lucide-pack"
        size="xs"
        color="neutral"
        variant="outline"
        :disabled="!props.targetName"
        :loading="props.busy"
        :label="t('inventory.autoArrange')"
        :title="props.targetName ? t('inventory.autoArrangeHint', { name: props.targetName }) : t('inventory.noStash')"
        @click="$emit('arrange')"
      />
    </header>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="item in props.items"
        :key="item.id"
        type="button"
        class="flex w-[104px] flex-col items-center gap-0.5 border bg-ink-800 p-1.5 text-center transition-colors hover:bg-ink-700"
        :style="{ borderColor: border(item) }"
        :title="item.name"
        @click="$emit('select', item)"
        @pointerdown="$emit('press', { item, event: $event })"
        @keydown.enter.prevent="$emit('pick', item, $event)"
        @keydown.space.prevent="$emit('pick', item, $event)"
      >
        <span class="flex h-10 w-full items-center justify-center">
          <img
            v-if="item.icon"
            :src="item.icon"
            :alt="item.name"
            class="max-h-10 max-w-full object-contain"
            loading="lazy"
          >
          <UIcon v-else name="i-lucide-package" class="size-6 text-[var(--sz-text-dim)]" />
        </span>
        <span class="line-clamp-2 text-[11px] leading-tight text-[var(--sz-text)]">{{ item.name }}</span>
        <span class="flex items-baseline gap-1 text-[11px] leading-none tabular-nums text-[var(--sz-text-muted)]">
          {{ t('items.level', { level: item.level }) }}
          <span v-if="item.qty > 1" class="tabular-nums">×{{ item.qty }}</span>
        </span>
      </button>
      <p
        v-if="!props.items.length"
        class="w-full border border-dashed border-[var(--sz-border)] px-2 py-2 text-center text-[11.5px] text-[var(--sz-text-dim)]"
      >
        {{ t('inventory.looseDropHere') }}
      </p>
    </div>
  </section>
</template>

<style scoped>
/* Display heads keep their own wrapping guarantees, whatever the global sheet holds. */
h2 {
  overflow-wrap: break-word;
  min-width: 0;
  text-wrap: balance;
}
</style>
