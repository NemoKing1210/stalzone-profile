<script setup lang="ts">
import { ConfirmActionModal } from '~/shared/ui';

import { OwnedPatchSchema } from '@dossier/shared/contracts';
import type { OwnedEditTarget } from '~/shared/types/dossier';
import type { WriteResult } from '~/shared/composables/useWrite';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ target: OwnedEditTarget | null }>();
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
  container: {
    containerType: null as string | null | undefined,
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
  form.skin = target.skin ?? undefined;
  form.note = target.note;
  form.role = target.role;
  form.slot = target.slot;
  form.container = {
    containerType: target.container?.containerType ?? null,
    shield: target.container?.shield ?? null,
    bonus: target.container?.bonus ?? null,
    protection: target.container?.protection ?? null,
    slots: target.container?.slots ?? null,
    eff: target.container?.eff ?? null,
  };
  form.dryRun = false;
  lastResult.value = null;
}

async function submit(): Promise<void> {
  const target = props.target;
  if (!target) return;

  const result = await write<WriteResult>(`/api/v1/owned/${target.ownedId}`, {
    method: 'PATCH',
    body: {
      level: form.level,
      qty: form.qty,
      quality: form.quality ?? null,
      skin: form.skin ?? null,
      note: form.note ?? null,
      role: form.role ?? null,
      slot: form.slot ?? null,
      ...(target.kind === 'container' ? { container: { ...form.container } } : {}),
      dryRun: form.dryRun,
    },
  });
  if (!result) return;

  lastResult.value = result;
  if (!result.dryRun) {
    open.value = false;
    emit('saved');
  }
}

async function remove(): Promise<void> {
  const target = props.target;
  if (!target) return;

  const result = await write<WriteResult>(`/api/v1/owned/${target.ownedId}`, {
    method: 'DELETE',
    body: { qty: form.qty, dryRun: false },
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
      <UForm :schema="OwnedPatchSchema" :state="form" class="space-y-4" @submit="submit">
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

        <div v-if="props.target?.kind === 'container'" class="space-y-3 border-t border-[var(--sz-border)] pt-3">
          <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('forms.containerOverride') }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField :label="t('forms.containerType')" name="container.containerType">
              <UInput v-model.nullable="form.container.containerType" class="w-full" />
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
