<script setup lang="ts">
import type { InventoryItemRead } from '@profile/shared/contracts';

const props = withDefaults(
  defineProps<{
    container: InventoryItemRead;
    /** Artifacts that can be installed; installed ones are filtered out. */
    candidates?: InventoryItemRead[];
    activeSlot?: number | null;
    busy?: boolean;
  }>(),
  { candidates: () => [], activeSlot: null, busy: false },
);

const emit = defineEmits<{ fill: [slots: (number | null)[]]; close: [] }>();

const { t } = useI18n();

const capacity = computed(() => props.container.container?.slots ?? null);
const slots = ref<(number | null)[]>([]);
const initial = ref('[]');

function rebuild(): void {
  const size = capacity.value ?? 0;
  const next = Array.from({ length: size }, () => null as number | null);
  for (const artifact of props.container.artifacts ?? []) {
    const placement = artifact.placement;
    if (placement.location === 'container' && placement.slotIndex < next.length) {
      next[placement.slotIndex] = artifact.id;
    }
  }
  slots.value = next;
  initial.value = JSON.stringify(next);
}

watch(() => props.container, rebuild, { immediate: true });

const byId = computed(() => {
  const map = new Map<number, InventoryItemRead>();
  for (const artifact of [...(props.container.artifacts ?? []), ...props.candidates]) {
    map.set(artifact.id, artifact);
  }
  return map;
});

function artifactAt(index: number): InventoryItemRead | null {
  const id = slots.value[index];
  return id == null ? null : (byId.value.get(id) ?? null);
}

const installed = computed(() => new Set(slots.value.filter((id): id is number => id != null)));

const available = computed(() => props.candidates.filter((artifact) => !installed.value.has(artifact.id)));

function place(artifactId: number): void {
  const free = slots.value.findIndex((value) => value === null);
  if (free === -1) return;
  slots.value[free] = artifactId;
}

function clear(index: number): void {
  slots.value[index] = null;
}

const changed = computed(() => JSON.stringify(slots.value) !== initial.value);

const summary = computed(() => {
  const data = props.container.container;
  if (!data) return t('inventory.containerNoData');
  return t('items.slotsValue', { slots: data.slots ?? '—', eff: data.eff ?? '—' });
});
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <p class="text-[12px] text-[var(--sz-text-muted)]">
        {{ props.container.name }} · {{ summary }}
      </p>
      <p class="text-[12px] tabular-nums text-[var(--sz-text-dim)]">
        {{ t('inventory.innerProtection') }}:
        {{ props.container.container?.protection ?? '—' }}
      </p>
    </div>

    <div v-if="capacity == null" class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-3 py-2 text-[12px]">
      {{ t('inventory.containerNoData') }}
    </div>

    <template v-else>
      <div class="grid grid-cols-5 gap-1">
        <div
          v-for="(_, index) in slots"
          :key="index"
          class="relative flex min-h-[54px] flex-col items-center justify-center gap-0.5 border bg-ink-800 p-1 text-center"
          :class="[
            props.activeSlot === index ? 'shadow-[inset_0_0_0_2px_var(--sz-accent)]' : '',
            artifactAt(index) ? 'border-[var(--sz-border-strong)]' : 'border-dashed border-[var(--sz-border)]',
          ]"
          :data-drop="`container:${props.container.id}:${index}`"
        >
          <template v-if="artifactAt(index)">
            <img
              v-if="artifactAt(index)!.icon"
              :src="artifactAt(index)!.icon!"
              :alt="artifactAt(index)!.name"
              class="h-7 max-w-full object-contain"
              loading="lazy"
            >
            <UIcon v-else name="i-lucide-gem" class="size-4 text-[var(--sz-text-dim)]" />
            <span class="line-clamp-1 text-[10px] leading-tight">{{ artifactAt(index)!.name }}</span>
            <button
              type="button"
              class="absolute right-0.5 top-0.5 border border-[var(--sz-border)] bg-ink-950 px-1 text-[10px] leading-tight text-[var(--sz-text-muted)] hover:text-[var(--sz-text)]"
              :aria-label="t('inventory.removeArtifact')"
              @click="clear(index)"
            >
              ×
            </button>
          </template>
          <span v-else class="text-[10.5px] tabular-nums text-[var(--sz-text-dim)]">{{ index + 1 }}</span>
        </div>
      </div>

      <div v-if="available.length" class="space-y-1">
        <p class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.availableArtifacts') }}</p>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="artifact in available"
            :key="artifact.id"
            type="button"
            class="flex items-center gap-1 border border-[var(--sz-border)] bg-ink-800 px-1.5 py-0.5 text-[11px] hover:bg-ink-700"
            :title="artifact.name"
            @click="place(artifact.id)"
          >
            <img v-if="artifact.icon" :src="artifact.icon" :alt="artifact.name" class="h-4 w-4 object-contain" loading="lazy">
            <UIcon v-else name="i-lucide-gem" class="size-3 text-[var(--sz-text-dim)]" />
            {{ artifact.name }}
          </button>
        </div>
      </div>

      <div class="flex flex-wrap justify-end gap-1">
        <UButton size="xs" color="neutral" variant="ghost" :label="t('common.reset')" :disabled="!changed" @click="rebuild" />
        <UButton
          size="xs"
          :label="t('common.save')"
          :loading="props.busy"
          :disabled="!changed"
          @click="emit('fill', [...slots])"
        />
      </div>
    </template>
  </div>
</template>
