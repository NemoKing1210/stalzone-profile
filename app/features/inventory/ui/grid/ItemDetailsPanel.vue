<script setup lang="ts">
import type { InventoryItemRead } from '@profile/shared/contracts';

import { RankBadge } from '~/entities/item';

const props = withDefaults(
  defineProps<{
    item: InventoryItemRead;
    busy?: boolean;
  }>(),
  { busy: false },
);

const emit = defineEmits<{
  close: [];
  update: [patch: Record<string, unknown>];
  moveLoose: [];
  remove: [];
  openContainer: [];
  openWeapon: [];
}>();

const { t } = useI18n();
const { rankColor, g2 } = useFormat();

const border = computed(() => rankColor(props.item.rank) ?? 'var(--sz-border-strong)');

const form = reactive({ level: 0, quality: '', rarity: '', note: '' });

function fill(): void {
  form.level = props.item.level;
  form.quality = props.item.quality ?? '';
  form.rarity = props.item.rarityPct == null ? '' : String(props.item.rarityPct);
  form.note = props.item.note ?? '';
}

watch(() => props.item, fill, { immediate: true, deep: true });

const changed = computed(() => {
  if (Number(form.level) !== props.item.level) return true;
  if ((form.quality.trim() || null) !== props.item.quality) return true;
  if ((form.note.trim() || null) !== props.item.note) return true;
  if (props.item.kind === 'artifact') {
    const rarity = form.rarity === '' ? null : Number(form.rarity);
    if (rarity !== props.item.rarityPct) return true;
  }
  return false;
});

function save(): void {
  const patch: Record<string, unknown> = {};
  const level = Math.max(0, Math.min(15, Number(form.level)));
  if (level !== props.item.level) patch.level = level;
  const quality = form.quality.trim() || null;
  if (quality !== props.item.quality) patch.quality = quality;
  if (props.item.kind === 'artifact') {
    const rarity = form.rarity === '' ? null : Number(form.rarity);
    if (rarity !== props.item.rarityPct) patch.rarityPct = rarity;
  }
  const note = form.note.trim() || null;
  if (note !== props.item.note) patch.note = note;
  if (Object.keys(patch).length) emit('update', patch);
}

const location = computed(() => {
  const placement = props.item.placement;
  if (placement.location === 'equipment') return t(`inventory.slots.${placement.slot}`);
  if (placement.location === 'weapon_module') return t(`inventory.module.${placement.slot}`);
  if (placement.location === 'container') return t('inventory.inContainer');
  if (placement.location === 'grid') return t('inventory.inGrid');
  return t('inventory.loose');
});

const facts = computed(() => {
  const item = props.item;
  return [
    { label: t('inventory.weight'), value: item.weight == null ? '—' : `${g2(item.weight)} kg` },
    { label: t('inventory.size'), value: `${item.size.width} × ${item.size.height}` },
    { label: t('inventory.quantity'), value: String(item.qty) },
    { label: t('inventory.rarity'), value: item.rarityPct == null ? '—' : `${g2(item.rarityPct)}%` },
    { label: t('inventory.quality'), value: item.quality ?? '—' },
    { label: t('inventory.location'), value: location.value },
  ];
});

const confirmOpen = ref(false);

function confirmRemove(): void {
  confirmOpen.value = false;
  emit('remove');
}
</script>

<template>
  <div class="space-y-3 text-[12px]">
    <header class="flex items-start gap-2 border p-1.5" :style="{ borderColor: border }">
      <span class="flex h-12 w-12 shrink-0 items-center justify-center bg-ink-950">
        <img
          v-if="props.item.icon"
          :src="props.item.icon"
          :alt="props.item.name"
          class="max-h-12 max-w-full object-contain"
          loading="lazy"
        >
        <UIcon v-else name="i-lucide-package" class="size-6 text-[var(--sz-text-dim)]" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-[13px]">{{ props.item.displayName ?? props.item.name }}</p>
        <p class="truncate text-[11px] text-[var(--sz-text-muted)]">
          {{ props.item.category ?? props.item.kind }} · {{ t('items.level', { level: props.item.level }) }}
        </p>
        <div class="mt-1 flex flex-wrap gap-1">
          <RankBadge :rank="props.item.rank" />
          <span
            v-if="props.item.rarityTier"
            class="border border-[var(--sz-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--sz-text-muted)]"
          >
            {{ props.item.rarityTier }}
          </span>
        </div>
      </div>
    </header>

    <dl class="divide-y divide-[var(--sz-border)] border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2">
      <div v-for="fact in facts" :key="fact.label" class="flex items-baseline justify-between gap-2 py-0.5">
        <dt class="text-[11px] text-[var(--sz-text-muted)]">{{ fact.label }}</dt>
        <dd class="truncate text-right tabular-nums">{{ fact.value }}</dd>
      </div>
    </dl>

    <p v-if="props.item.container" class="border border-[var(--sz-border)] px-2 py-1 text-[11px]">
      {{ t('items.slotsValue', { slots: props.item.container.slots ?? '—', eff: props.item.container.eff ?? '—' }) }}
    </p>

    <div class="flex flex-wrap gap-1">
      <UButton
        v-if="props.item.kind === 'container'"
        size="xs"
        color="neutral"
        variant="outline"
        icon="i-lucide-box"
        :label="t('inventory.containerFill')"
        @click="emit('openContainer')"
      />
      <UButton
        v-if="props.item.kind === 'weapon'"
        size="xs"
        color="neutral"
        variant="outline"
        icon="i-lucide-paperclip"
        :label="t('inventory.weaponModules')"
        @click="emit('openWeapon')"
      />
      <UButton
        v-if="props.item.placement.location !== 'loose'"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-undo-2"
        :label="t('inventory.moveToLoose')"
        :disabled="props.busy"
        @click="emit('moveLoose')"
      />
      <UButton
        size="xs"
        color="error"
        variant="ghost"
        icon="i-lucide-trash-2"
        :label="t('common.delete')"
        :disabled="props.busy"
        @click="confirmOpen = true"
      />
    </div>

    <section class="space-y-2 border-t border-[var(--sz-border)] pt-2">
      <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.instanceSettings') }}</h3>
      <div class="grid grid-cols-2 gap-2">
        <label class="block text-[11px] text-[var(--sz-text-muted)]">
          {{ t('inventory.level') }}
          <UInput v-model.number="form.level" type="number" size="xs" class="mt-0.5 w-full" :min="0" :max="15" />
        </label>
        <label class="block text-[11px] text-[var(--sz-text-muted)]">
          {{ t('inventory.quality') }}
          <UInput v-model="form.quality" size="xs" class="mt-0.5 w-full" :maxlength="100" />
        </label>
        <label v-if="props.item.kind === 'artifact'" class="col-span-2 block text-[11px] text-[var(--sz-text-muted)]">
          {{ t('inventory.rarityPercent') }}
          <UInput
            v-model="form.rarity"
            type="number"
            size="xs"
            class="mt-0.5 w-full"
            :min="0"
            :max="175"
            :placeholder="t('common.noData')"
          />
        </label>
        <label class="col-span-2 block text-[11px] text-[var(--sz-text-muted)]">
          {{ t('inventory.note') }}
          <UTextarea v-model="form.note" size="xs" class="mt-0.5 w-full" :rows="2" :maxlength="2000" />
        </label>
      </div>
      <UButton size="xs" :label="t('common.save')" :loading="props.busy" :disabled="!changed" @click="save" />
    </section>

    <UModal v-model:open="confirmOpen" :title="t('inventory.removeItemTitle')">
      <template #body>
        <p class="text-[12.5px]">{{ t('inventory.removeItemDesc', { name: props.item.name }) }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="confirmOpen = false" />
          <UButton color="error" :loading="props.busy" :label="t('common.delete')" @click="confirmRemove" />
        </div>
      </template>
    </UModal>
  </div>
</template>
