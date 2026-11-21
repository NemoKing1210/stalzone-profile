<script setup lang="ts">
import type { ChatPin } from '@profile/shared/contracts';

const props = defineProps<{ pins: ChatPin[]; limit: number; loading?: boolean }>();
const emit = defineEmits<{ add: []; remove: [pin: ChatPin] }>();
const { t } = useI18n();

function keyOf(pin: ChatPin): string {
  return `${pin.kind}:${pin.itemId}:${pin.instanceId ?? 'catalog'}`;
}
</script>

<template>
  <div
    class="flex items-center gap-1.5 overflow-x-auto border-b border-[var(--sz-border)] px-2 py-1.5"
    role="group"
    :aria-label="t('chat.pins.title')"
  >
    <UIcon name="i-lucide-pin" class="size-3.5 shrink-0 text-[var(--sz-accent)]" aria-hidden="true" />
    <span class="sz-caps shrink-0 text-[10px] text-[var(--sz-text-muted)]">{{ t('chat.pins.title') }}</span>
    <button
      v-for="pin in props.pins"
      :key="keyOf(pin)"
      type="button"
      class="inline-flex max-w-[15rem] shrink-0 items-center gap-1.5 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] py-0.5 pe-1 ps-1.5 text-[11.5px] text-[var(--sz-text)] transition-colors hover:border-[var(--sz-border-strong)] max-sm:min-h-11"
      :title="t('chat.pins.remove', { name: pin.name })"
      :aria-label="t('chat.pins.remove', { name: pin.name })"
      @click="emit('remove', pin)"
    >
      <img v-if="pin.icon" :src="pin.icon" alt="" class="size-4 shrink-0 object-contain">
      <UIcon v-else name="i-lucide-package" class="size-4 shrink-0 text-[var(--sz-text-muted)]" aria-hidden="true" />
      <span class="truncate">{{ pin.name }}</span>
      <span v-if="pin.level != null" class="shrink-0 tabular-nums text-[10px] text-[var(--sz-text-dim)]">
        {{ pin.level }}
      </span>
      <UIcon name="i-lucide-x" class="size-3 shrink-0 text-[var(--sz-text-dim)]" aria-hidden="true" />
    </button>
    <UButton
      size="xs"
      color="neutral"
      variant="ghost"
      icon="i-lucide-pin"
      :label="props.pins.length ? undefined : t('chat.pins.add')"
      :aria-label="t('chat.pins.add')"
      :title="t('chat.pins.add')"
      :disabled="props.loading || props.pins.length >= props.limit"
      class="shrink-0 max-sm:size-11"
      @click="emit('add')"
    />
  </div>
</template>
