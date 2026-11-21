<script setup lang="ts">
import { useQuery } from '@pinia/colada';
import type { ItemSummary } from '@profile/shared/contracts';
import { InventoryKindSchema } from '@profile/shared/contracts';
import { rarityTierForPct } from '@profile/shared/ranks';
import { allInventoryItems } from '~/shared/lib/inventory';
import { MODAL_WIDTH } from '~/shared/lib/modalWidth';
import { useProfileData } from '~/stores/profile-data';
import { ownedInstanceCounts } from '../model/itemPicker';
import { useInventory } from '../model/useInventory';
import { itemCreatePayload, itemFormFields, skinsFor } from '../model/itemForm';
import ItemPicker from './picker/ItemPicker.vue';
import ItemPreview from './picker/ItemPreview.vue';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ kind?: string }>();
const emit = defineEmits<{ saved: []; created: [{ instanceId: number; name: string; kind: string }] }>();

const { t } = useI18n();
const { payload } = useProfileData();
const inventory = useInventory();
const formId = useId();
/** The catalog list, preview and fields can outgrow a phone; keep the body scrolling and the footer in place. */
const modalUi = {
  content: `${MODAL_WIDTH.wide} max-h-[calc(100dvh-2rem)]`,
  body: 'min-h-0 overflow-y-auto',
};

const KIND_OPTIONS = InventoryKindSchema.options;
const activeKind = ref<string>(props.kind ?? 'all');
const selected = ref<ItemSummary | null>(null);
const fields = computed(() => itemFormFields(selected.value?.kind ?? activeKind.value));
const kindOptions = computed<{ label: string; value: string }[]>(() => [
  { label: t('inventory.filter.allKinds'), value: 'all' },
  ...KIND_OPTIONS.map((kind) => ({ label: t(`inventory.filterKinds.${kind}`), value: kind })),
]);

/** Catalog names double as the instance names, so the picker can mark what is already owned. */
const owned = computed(() => ownedInstanceCounts(allInventoryItems(payload.value?.inventory ?? null)));

const form = reactive({
  level: 0,
  qty: 1,
  rarityPct: null as number | null,
  skin: undefined as string | undefined,
  virtual: false,
});
const rarityTier = computed(() => rarityTierForPct(form.rarityPct));

const catalogEmpty = computed(() => {
  const meta = payload.value?.catalog?.meta as { items?: number } | undefined;
  return Number(meta?.items ?? 0) === 0;
});

watch(activeKind, () => {
  if (selected.value && selected.value.kind !== activeKind.value) selected.value = null;
});

/** Choosing a row fixes the kind for the rest of the form. */
watch(selected, (item) => {
  if (item) activeKind.value = item.kind;
});

const request = useRequestFetch();

const { data: motifs } = useQuery({
  key: ['catalog', 'motifs'],
  query: () => request<{ name: string; baseItemId?: number | null }[]>('/api/v1/items', {
    query: { kind: 'motif', limit: 200 },
  }),
  enabled: () => open.value && fields.value.skin,
});
const skinItems = computed(() => skinsFor(motifs.value ?? [], selected.value?.id));

watch(open, (value) => {
  if (value) reset();
});

/** A fresh item form; the catalog context (search, rank, sort) stays as the user left it. */
function resetForm(): void {
  selected.value = null;
  form.level = 0;
  form.qty = 1;
  form.rarityPct = null;
  form.skin = undefined;
  form.virtual = false;
}

function reset(): void {
  resetForm();
  activeKind.value = props.kind ?? 'all';
}

async function submit(): Promise<void> {
  const item = selected.value;
  if (!item) return;

  const body = itemCreatePayload(item.kind, item, form);
  const result = await inventory.addItem(body);
  if (!result) return;

  const instanceId = (result.diff.after as { id?: number | null } | null)?.id;
  // One add may be followed by another; keep the modal and the catalog context open.
  resetForm();
  emit('saved');
  if (instanceId) emit('created', { instanceId, name: item.name, kind: item.kind });
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('owned.addTitle')"
    :description="t('owned.addDescription')"
    :ui="modalUi"
    scrollable
  >
    <template #body>
      <div v-if="catalogEmpty" class="space-y-3">
        <UAlert color="warning" variant="subtle" icon="i-lucide-package-x" :title="t('owned.catalogRequired')" />
        <UButton to="/settings" :label="t('owned.catalogRequiredAction')" />
      </div>

      <UForm v-else :id="formId" :state="form" class="space-y-4" @submit="submit">
        <UFormField v-if="!kind" :label="t('owned.kindLabel')" name="kind">
          <USelect v-model="activeKind" :items="kindOptions" class="w-full" />
        </UFormField>

        <div class="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <ItemPicker v-model="selected" :kind="activeKind" :active="open" :owned="owned" />

          <div class="min-w-0 space-y-3">
            <ItemPreview
              :item="selected"
              :owned="selected ? (owned.get(selected.name) ?? 0) : 0"
            />

            <div v-if="selected" class="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
              <UFormField v-if="fields.level" :label="t('forms.level')" name="level">
                <UInputNumber v-model="form.level" :min="0" :max="15" class="w-full" />
              </UFormField>
              <UFormField v-if="fields.qty" :label="t('forms.qty')" name="qty">
                <UInputNumber v-model="form.qty" :min="1" :max="99" class="w-full" />
              </UFormField>
              <UFormField v-if="fields.rarity" :label="t('forms.rarityPercent')" name="rarityPct">
                <UInputNumber v-model="form.rarityPct" :min="0" :max="175" class="w-full" />
                <p v-if="rarityTier" class="mt-1 text-[11px] text-[var(--sz-text-muted)]">
                  {{ t('forms.rarityTier') }}: {{ t(`items.rarityTier.${rarityTier}`) }}
                </p>
              </UFormField>
              <UFormField v-if="fields.skin" :label="t('forms.skin')" name="skin">
                <USelectMenu
                  v-model="form.skin"
                  :items="skinItems"
                  searchable
                  clearable
                  :placeholder="t('forms.noSkin')"
                  class="w-full"
                />
              </UFormField>
              <UFormField name="virtual">
                <USwitch v-model="form.virtual" :label="t('forms.virtual')" />
              </UFormField>
            </div>
          </div>
        </div>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton type="button" color="neutral" variant="ghost" :label="t('common.cancel')" @click="open = false" />
        <UButton
          type="submit"
          :form="formId"
          :loading="inventory.busy.value"
          :disabled="!selected"
          :label="t('owned.add')"
        />
      </div>
    </template>
  </UModal>
</template>
