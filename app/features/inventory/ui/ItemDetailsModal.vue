<script setup lang="ts">
import type { InventoryItemRead, ModuleSlot } from '@profile/shared/contracts';

import { RankBadge, RarityName } from '~/entities/item';

import { detailRows } from '../model/details';
import ContainerPanel from './grid/ContainerPanel.vue';
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
  remove: [];
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
const form = reactive({ level: 0, quality: '', rarity: '', note: '' });

function fillForm(): void {
  if (!props.item) return;
  form.level = props.item.level;
  form.quality = props.item.quality ?? '';
  form.rarity = props.item.rarityPct == null ? '' : String(props.item.rarityPct);
  form.note = props.item.note ?? '';
}

watch(() => props.item, fillForm, { immediate: true });

const changed = computed(() => {
  const item = props.item;
  if (!item) return false;
  if (Number(form.level) !== item.level) return true;
  if ((form.quality.trim() || null) !== item.quality) return true;
  if ((form.note.trim() || null) !== item.note) return true;
  if (item.kind === 'artifact') {
    const rarity = form.rarity === '' ? null : Number(form.rarity);
    if (rarity !== item.rarityPct) return true;
  }
  return false;
});

function save(): void {
  const item = props.item;
  if (!item) return;
  const patch: Record<string, unknown> = {};
  const level = Math.max(0, Math.min(15, Number(form.level)));
  if (level !== item.level) patch.level = level;
  const quality = form.quality.trim() || null;
  if (quality !== item.quality) patch.quality = quality;
  if (item.kind === 'artifact') {
    const rarity = form.rarity === '' ? null : Number(form.rarity);
    if (rarity !== item.rarityPct) patch.rarityPct = rarity;
  }
  const note = form.note.trim() || null;
  if (note !== item.note) patch.note = note;
  if (Object.keys(patch).length) emit('update', patch);
}

const confirmOpen = ref(false);

function confirmRemove(): void {
  confirmOpen.value = false;
  emit('remove');
}
</script>

<template>
  <UModal
    :open="props.open"
    :title="t('items.cardTitle')"
    :description="props.name"
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
            <UIcon v-else name="i-lucide-package" class="size-6 text-[var(--sz-text-dim)]" />
          </span>
          <div class="min-w-0 flex-1">
            <p><RarityName :name="props.name" :rank="rank" size="lg" /></p>
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

      <UModal v-model:open="confirmOpen" :title="t('inventory.removeItemTitle')">
        <template #body>
          <p class="text-[12.5px]">{{ t('inventory.removeItemDesc', { name: props.name }) }}</p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="confirmOpen = false" />
            <UButton color="error" :loading="props.busy" :label="t('common.delete')" @click="confirmRemove" />
          </div>
        </template>
      </UModal>
    </template>
  </UModal>
</template>
