<script setup lang="ts">
import type { DamagePoint, InventoryItemRead, ModuleSlot } from '@profile/shared/contracts';

import { ItemIconFallback, RankBadge, RarityName, VirtualBadge } from '~/entities/item';
import { MODAL_WIDTH } from '~/shared/lib/modalWidth';
import { rarityTierForPct } from '@profile/shared/ranks';

import { detailRows } from '../model/details';
import { itemFormFields } from '../model/itemForm';
import ContainerPanel from './grid/ContainerPanel.vue';
import DamageFalloffChart from './DamageFalloffChart.vue';
import RemoveItemModal from './RemoveItemModal.vue';
import WeaponPanel from './grid/WeaponPanel.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    kind: string;
    name: string;
    /** The live instance behind the modal; `null` for a catalog row. */
    item?: InventoryItemRead | null;
    /** `payload.details` card for the name. */
    card?: Record<string, unknown> | null;
    /** The owned/catalog row the screen opened, used when there is no instance. */
    row?: Record<string, unknown> | null;
    attachments?: InventoryItemRead[];
    artifacts?: InventoryItemRead[];
    busy?: boolean;
  }>(),
  {
    item: null,
    card: null,
    row: null,
    attachments: () => [],
    artifacts: () => [],
    busy: false,
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  update: [patch: Record<string, unknown>];
  remove: [qty: number];
  install: [slot: ModuleSlot, attachmentItemId: number | null];
  fill: [slots: (number | null)[]];
  edit: [];
  fillRow: [];
  artifact: [name: string, level: number];
}>();

const { t } = useI18n();
const { g1, g2, num } = useFormat();

const icon = computed(() => props.item?.icon ?? (typeof props.row?.icon === 'string' ? props.row.icon : null));
const rank = computed(() => props.item?.rank ?? (typeof props.row?.rank === 'string' ? props.row.rank : null));
const level = computed(() => props.item?.level ?? (typeof props.row?.lvl === 'number' ? props.row.lvl : null));
const category = computed(() => props.item?.category ?? (typeof props.row?.type === 'string' ? props.row.type : null));
const virtual = computed(() => props.item?.virtual ?? props.row?.virtual === true);

interface ArtifactEntry {
  name: string;
  level: number;
}

const containerArtifacts = computed<ArtifactEntry[]>(() => {
  if (props.item?.artifacts?.length) {
    return props.item.artifacts.map((artifact) => ({ name: artifact.name, level: artifact.level }));
  }
  const raw = props.row?.artifacts;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { name, lvl } = entry as { name?: unknown; lvl?: unknown };
    return typeof name === 'string' ? [{ name, level: typeof lvl === 'number' ? lvl : 0 }] : [];
  });
});

/** Both owned and catalog weapons read the curve from the card the screen already has. */
const falloffCard = computed(
  () =>
    (props.card ?? props.item?.card ?? null) as { p0?: DamagePoint | null; p15?: DamagePoint | null } | null,
);

const rows = computed(() =>
  detailRows(props.kind, {
    item: props.item,
    card: props.card,
    row: props.row,
  }),
);

function format(key: string, value: string | number): string {
  if (typeof value !== 'number') return value;
  if (key === 'weight') return t('inventory.weightValue', { value: g2(value) });
  if (key === 'rarityPct') return `${g2(value)}%`;
  if (key === 'eff') return `${g1(value)}%`;
  return Number.isInteger(value) ? num(value) : g2(value);
}

/** Instances can be edited in place; a catalog row only opens the owned editor. */
const form = reactive({ level: 0, qty: 1, rarityPct: null as number | null, virtual: false });
const fields = computed(() => itemFormFields(props.item?.kind ?? ''));
const rarityTier = computed(() => rarityTierForPct(form.rarityPct));

function fillForm(): void {
  if (!props.item) return;
  form.level = props.item.level;
  form.qty = props.item.qty;
  form.rarityPct = props.item.rarityPct;
  form.virtual = props.item.virtual;
}

watch(() => props.item, fillForm, { immediate: true });

const changed = computed(() => {
  const item = props.item;
  if (!item) return false;
  if (fields.value.level && Math.trunc(form.level) !== item.level) return true;
  if (fields.value.qty && Math.trunc(form.qty) !== item.qty) return true;
  if (fields.value.rarity && form.rarityPct !== item.rarityPct) return true;
  if (form.virtual !== item.virtual) return true;
  return false;
});

function save(): void {
  const item = props.item;
  if (!item) return;
  const patch: Record<string, unknown> = {};
  if (fields.value.level) {
    const level = Math.max(0, Math.min(15, Math.trunc(Number(form.level))));
    if (level !== item.level) patch.level = level;
  }
  if (fields.value.qty) {
    const qty = Math.max(1, Math.min(99, Math.trunc(Number(form.qty))));
    if (qty !== item.qty) patch.qty = qty;
  }
  if (fields.value.rarity && form.rarityPct !== item.rarityPct) patch.rarityPct = form.rarityPct;
  if (form.virtual !== item.virtual) patch.virtual = form.virtual;
  if (Object.keys(patch).length) emit('update', patch);
}

const confirmOpen = ref(false);

function confirmRemove(qty: number): void {
  confirmOpen.value = false;
  emit('remove', qty);
}
</script>

<template>
  <UModal
    :open="props.open"
    :title="t('items.cardTitle')"
    :description="props.name"
    :ui="{ content: MODAL_WIDTH.reader }"
    scrollable
    @update:open="(value: boolean) => emit('update:open', value)"
  >
    <template #body>
      <div class="space-y-3 text-[12px]">
        <header class="flex items-start gap-2 border border-[var(--sz-border)] p-1.5">
          <span class="flex h-12 w-12 shrink-0 items-center justify-center bg-ink-950">
            <img
              v-if="icon"
              :src="icon"
              :alt="props.name"
              class="max-h-12 max-w-full object-contain"
              loading="lazy"
            >
            <ItemIconFallback v-else :size="24" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-1.5"><RarityName :name="props.name" :rank="rank" size="lg" /><VirtualBadge v-if="virtual" /></p>
            <p class="text-[11px] text-[var(--sz-text-muted)]">
              {{ category ?? props.kind }}
              <span v-if="level != null">{{ t('items.level', { level }) }}</span>
            </p>
            <div class="mt-1 flex flex-wrap gap-1">
              <RankBadge :rank="rank" />
            </div>
          </div>
        </header>

        <dl v-if="rows.length" class="divide-y divide-[var(--sz-border)] border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2">
          <div v-for="field in rows" :key="field.key" class="flex items-baseline justify-between gap-2 py-0.5">
            <dt class="text-[11px] text-[var(--sz-text-muted)]">{{ t(field.labelKey) }}</dt>
            <dd class="truncate text-right tabular-nums">{{ format(field.key, field.value) }}</dd>
          </div>
        </dl>

        <ul v-if="containerArtifacts.length" class="flex flex-wrap gap-1">
          <li v-for="(artifact, index) in containerArtifacts" :key="`${artifact.name}-${index}`">
            <button
              type="button"
              class="inline-flex items-baseline gap-1 border border-[var(--sz-border)] px-1.5 py-0.5 text-[11px] hover:bg-ink-700"
              @click="emit('artifact', artifact.name, artifact.level)"
            >
              {{ artifact.name }}
              <span class="tabular-nums text-[var(--sz-text-muted)]">+{{ artifact.level }}</span>
            </button>
          </li>
        </ul>

        <DamageFalloffChart
          v-if="props.kind === 'weapon' && falloffCard"
          class="border-t border-[var(--sz-border)] pt-2"
          :p0="falloffCard.p0"
          :p15="falloffCard.p15"
        />

        <div v-if="props.item && props.item.kind === 'weapon'" class="[&_header]:hidden">
          <WeaponPanel
            :weapon="props.item"
            :attachments="props.attachments"
            :busy="props.busy"
            @install="(slot, attachmentItemId) => emit('install', slot, attachmentItemId)"
          />
        </div>

        <ContainerPanel
          v-if="props.item && props.item.kind === 'container'"
          :container="props.item"
          :candidates="props.artifacts"
          :busy="props.busy"
          @fill="(slots) => emit('fill', slots)"
        />

        <section v-if="props.item" class="space-y-2 border-t border-[var(--sz-border)] pt-2">
          <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.instanceSettings') }}</h3>
          <div class="grid grid-cols-2 gap-2">
            <USwitch v-model="form.virtual" class="col-span-2" :label="t('forms.virtual')" />
            <label v-if="fields.level" class="block text-[11px] text-[var(--sz-text-muted)]">
              {{ t('inventory.level') }}
              <UInput v-model.number="form.level" type="number" size="xs" class="mt-0.5 w-full" :min="0" :max="15" />
            </label>
            <label v-if="fields.qty" class="block text-[11px] text-[var(--sz-text-muted)]">
              {{ t('forms.qty') }}
              <UInput v-model.number="form.qty" type="number" size="xs" class="mt-0.5 w-full" :min="1" :max="99" />
            </label>
            <label v-if="fields.rarity" class="col-span-2 block text-[11px] text-[var(--sz-text-muted)]">
              {{ t('inventory.rarityPercent') }}
              <UInput
                v-model.number="form.rarityPct"
                type="number"
                size="xs"
                class="mt-0.5 w-full"
                :min="0"
                :max="175"
                :placeholder="t('common.noData')"
              />
              <span v-if="rarityTier" class="mt-0.5 block text-[10.5px] text-[var(--sz-text-dim)]">
                {{ t('forms.rarityTier') }}: {{ t(`items.rarityTier.${rarityTier}`) }}
              </span>
            </label>
          </div>
          <div class="flex flex-wrap gap-1">
            <UButton size="xs" :label="t('common.save')" :loading="props.busy" :disabled="!changed" @click="save" />
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
        </section>

        <div v-else-if="props.row?.instanceId != null" class="flex flex-wrap gap-1 border-t border-[var(--sz-border)] pt-2">
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-pencil"
            :label="t('common.edit')"
            @click="emit('edit')"
          />
          <UButton
            v-if="props.kind === 'container'"
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-gem"
            :label="t('containers.fill')"
            @click="emit('fillRow')"
          />
        </div>
      </div>

      <RemoveItemModal
        v-model:open="confirmOpen"
        :name="props.name"
        :qty="props.item?.qty ?? 1"
        :loading="props.busy"
        @confirm="confirmRemove"
      />
    </template>
  </UModal>
</template>
