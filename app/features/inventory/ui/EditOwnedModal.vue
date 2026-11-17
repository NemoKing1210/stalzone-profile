<script setup lang="ts">
import type { RarityTier } from '@profile/shared/contracts';
import { RarityTierSchema } from '@profile/shared/contracts';
import type { InstanceEditTarget } from '~/shared/types/profile';
import type { WriteResult } from '~/shared/composables/useWrite';

import { ConfirmActionModal } from '~/shared/ui';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ target: InstanceEditTarget | null }>();
const emit = defineEmits<{ saved: []; deleted: [] }>();

const { write, busy } = useWrite();
const { t } = useI18n();

const form = reactive({
  level: 0,
  qty: 1,
  quality: null as string | null | undefined,
  skin: undefined as string | undefined,
  note: null as string | null | undefined,
  role: null as string | null | undefined,
  slot: null as string | null | undefined,
  rarity: null as number | null,
  rarityTier: 'none' as RarityTier | 'none',
  layoutWidth: null as number | null,
  layoutHeight: null as number | null,
  layoutWeight: null as number | null,
  container: {
    type: null as string | null | undefined,
    shield: null as number | null,
    bonus: null as string | null | undefined,
    protection: null as number | null,
    slots: null as number | null,
    eff: null as number | null,
  },
  dryRun: false,
});

const lastResult = ref<WriteResult | null>(null);
const confirmOpen = ref(false);

const { data: motifs } = useFetch<{ name: string }[]>('/api/v1/items', {
  query: { kind: 'motif', limit: 200 },
  key: 'motif-items',
  default: () => [],
});
const skinItems = computed(() => (motifs.value ?? []).map((motif) => motif.name));

const tierItems = computed(() => [
  { label: t('forms.rarityTierNone'), value: 'none' },
  ...RarityTierSchema.options.map((tier) => ({ label: t(`items.rarityTier.${tier}`), value: tier })),
]);

watch(open, (value) => {
  if (value) reset();
});
watch(
  () => props.target,
  () => {
    if (open.value) reset();
  },
);

function reset(): void {
  const target = props.target;
  if (!target) return;
  form.level = target.level;
  form.qty = target.qty;
  form.quality = target.quality;
  form.skin = undefined;
  form.note = target.note;
  form.role = target.role;
  form.slot = target.slot;
  form.rarity = target.rarityPct;
  form.rarityTier = target.rarityTier ?? 'none';
  form.layoutWidth = null;
  form.layoutHeight = null;
  form.layoutWeight = null;
  form.container = {
    type: target.container?.type ?? null,
    shield: target.container?.shield ?? null,
    bonus: target.container?.bonus ?? null,
    protection: target.container?.protection ?? null,
    slots: target.container?.slots ?? null,
    eff: target.container?.eff ?? null,
  };
  form.dryRun = false;
  lastResult.value = null;
}

const isArtifact = computed(() => props.target?.kind === 'artifact');
const isContainer = computed(() => props.target?.kind === 'container');

const layoutPair = computed(() => {
  const width = form.layoutWidth;
  const height = form.layoutHeight;
  if (width == null && height == null) return { valid: true, value: null };
  if (width == null || height == null || width < 1 || height < 1) return { valid: false, value: null };
  return { valid: true, value: { width, height } };
});

function instancePatch(target: InstanceEditTarget): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (form.level !== target.level) patch.level = form.level;
  if (form.qty !== target.qty) patch.qty = form.qty;
  const quality = form.quality ?? null;
  if (quality !== target.quality) patch.quality = quality;
  const note = form.note ?? null;
  if (note !== target.note) patch.note = note;
  if ((form.role ?? null) !== target.role) patch.role = form.role ?? null;
  if ((form.slot ?? null) !== target.slot) patch.slot = form.slot ?? null;
  // The read shape carries the skin id, not its name: send a skin only when one is chosen.
  if (form.skin) patch.skin = form.skin;
  if (isArtifact.value) {
    if (form.rarity !== target.rarityPct) patch.rarityPct = form.rarity;
    const tier = form.rarityTier === 'none' ? null : form.rarityTier;
    if (tier !== target.rarityTier) patch.rarityTier = tier;
  }
  if (isContainer.value) {
    const current = target.container;
    const next = { ...form.container };
    const changed =
      next.type !== (current?.type ?? null) ||
      next.shield !== (current?.shield ?? null) ||
      next.bonus !== (current?.bonus ?? null) ||
      next.protection !== (current?.protection ?? null) ||
      next.slots !== (current?.slots ?? null) ||
      next.eff !== (current?.eff ?? null);
    if (changed) patch.container = next;
  }
  return patch;
}

const hasChanges = computed(() => {
  const target = props.target;
  if (!target) return false;
  return Object.keys(instancePatch(target)).length > 0 || layoutPair.value.value !== null;
});

async function submit(): Promise<void> {
  const target = props.target;
  if (!target) return;

  let wrote = false;
  const patch = instancePatch(target);
  if (Object.keys(patch).length) {
    const result = await write<WriteResult>(`/api/v1/inventory/items/${target.instanceId}`, {
      method: 'PATCH',
      body: { ...patch, dryRun: form.dryRun },
    });
    if (!result) return;
    lastResult.value = result;
    if (result.dryRun) return;
    wrote = true;
  }

  const layout = layoutPair.value.value;
  if (layout) {
    const result = await write<WriteResult>(`/api/v1/items/${target.itemId}/layout`, {
      method: 'PATCH',
      body: {
        ...layout,
        ...(form.layoutWeight == null ? {} : { weight: form.layoutWeight }),
      },
    });
    if (!result) return;
    wrote = true;
  }

  if (wrote) {
    open.value = false;
    emit('saved');
  }
}

async function remove(): Promise<void> {
  const target = props.target;
  if (!target) return;

  const result = await write<WriteResult>(`/api/v1/inventory/items/${target.instanceId}`, {
    method: 'DELETE',
    body: { qty: form.qty },
  });
  if (!result) return;

  confirmOpen.value = false;
  open.value = false;
  emit('deleted');
}
</script>

<template>
  <UModal v-model:open="open" :title="t('items.editTitle')" :description="props.target?.name" scrollable>
    <template #body>
      <UForm :state="form" class="space-y-4" @submit="submit">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField :label="t('forms.level')" name="level">
            <UInputNumber v-model="form.level" :min="0" :max="15" class="w-full" />
          </UFormField>
          <UFormField :label="t('forms.qty')" name="qty">
            <UInputNumber v-model="form.qty" :min="1" :max="99" class="w-full" />
          </UFormField>
          <UFormField :label="t('forms.quality')" name="quality">
            <UInput v-model.nullable="form.quality" :placeholder="t('forms.qualityPlaceholder')" class="w-full" />
          </UFormField>
          <UFormField v-if="isArtifact" :label="t('forms.rarity')" name="rarity">
            <UInputNumber v-model="form.rarity" :min="0" :max="175" class="w-full" />
          </UFormField>
          <UFormField v-if="isArtifact" :label="t('forms.rarityTier')" name="rarityTier">
            <USelect v-model="form.rarityTier" :items="tierItems" class="w-full" />
          </UFormField>
          <UFormField :label="t('forms.skin')" name="skin">
            <USelectMenu
              v-model="form.skin"
              :items="skinItems"
              searchable
              clearable
              :placeholder="t('forms.noSkin')"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('forms.role')" name="role">
            <UInput v-model.nullable="form.role" :placeholder="t('forms.rolePlaceholder')" class="w-full" />
          </UFormField>
          <UFormField :label="t('forms.slot')" name="slot">
            <UInput v-model.nullable="form.slot" :placeholder="t('forms.slotPlaceholder')" class="w-full" />
          </UFormField>
        </div>

        <UFormField :label="t('forms.note')" name="note">
          <UTextarea v-model.nullable="form.note" :rows="2" class="w-full" />
        </UFormField>

        <div class="space-y-3 border-t border-[var(--sz-border)] pt-3">
          <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('forms.layoutOverride') }}</p>
          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField :label="t('forms.layoutWidth')" name="layoutWidth">
              <UInputNumber v-model="form.layoutWidth" :min="1" :max="20" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.layoutHeight')" name="layoutHeight">
              <UInputNumber v-model="form.layoutHeight" :min="1" :max="20" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.layoutWeight')" name="layoutWeight">
              <UInputNumber v-model="form.layoutWeight" :min="0" class="w-full" />
            </UFormField>
          </div>
          <p class="text-[11px] text-[var(--sz-text-dim)]">{{ t('forms.layoutHint') }}</p>
          <p v-if="!layoutPair.valid" class="text-[11px] text-[var(--sz-error-text)]">
            {{ t('forms.layoutPairError') }}
          </p>
        </div>

        <div v-if="isContainer" class="space-y-3 border-t border-[var(--sz-border)] pt-3">
          <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('forms.containerOverride') }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField :label="t('forms.containerType')" name="container.type">
              <UInput v-model.nullable="form.container.type" class="w-full" />
            </UFormField>
            <UFormField :label="t('table.slots')" name="container.slots">
              <UInputNumber v-model="form.container.slots" :min="0" class="w-full" />
            </UFormField>
            <UFormField :label="t('table.efficiency')" name="container.eff">
              <UInputNumber v-model="form.container.eff" :min="0" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.protection')" name="container.protection">
              <UInputNumber v-model="form.container.protection" :min="0" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.shield')" name="container.shield">
              <UInputNumber v-model="form.container.shield" :min="0" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.bonus')" name="container.bonus">
              <UInput v-model.nullable="form.container.bonus" class="w-full" />
            </UFormField>
          </div>
        </div>

        <UFormField name="dryRun">
          <USwitch v-model="form.dryRun" :label="t('common.dryRun')" />
        </UFormField>

        <UAlert
          v-if="lastResult"
          :color="lastResult.dryRun ? 'info' : 'success'"
          variant="subtle"
          icon="i-lucide-list-checks"
          :title="lastResult.dryRun ? t('common.dryRunTitle') : t('common.changeWritten')"
          :description="lastResult.diff.human"
        />

        <div class="flex flex-wrap items-center justify-between gap-2">
          <UButton
            type="button"
            color="error"
            variant="soft"
            icon="i-lucide-trash-2"
            :label="t('common.delete')"
            @click="confirmOpen = true"
          />
          <div class="flex gap-2">
            <UButton type="button" color="neutral" variant="ghost" :label="t('common.cancel')" @click="open = false" />
            <UButton
              type="submit"
              :disabled="!hasChanges || !layoutPair.valid"
              :loading="busy"
              :label="form.dryRun ? t('common.check') : t('common.save')"
            />
          </div>
        </div>
      </UForm>
    </template>
  </UModal>

  <ConfirmActionModal
    v-model:open="confirmOpen"
    :title="t('items.deleteTitle')"
    :description="t('items.deleteConfirm', { name: props.target?.name ?? '', qty: form.qty })"
    :confirm-label="t('common.delete')"
    :loading="busy"
    @confirm="remove"
  />
</template>
