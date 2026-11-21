<script setup lang="ts">
import { useQuery } from '@pinia/colada';
import { InventoryKindSchema } from '@profile/shared/contracts';
import { rarityTierForPct } from '@profile/shared/ranks';
import { MODAL_WIDTH } from '~/shared/lib/modalWidth';
import { useProfileData } from '~/stores/profile-data';
import { useInventory } from '../model/useInventory';
import { itemCreatePayload, itemFormFields, skinsFor } from '../model/itemForm';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ kind?: string }>();
const emit = defineEmits<{ saved: []; created: [{ instanceId: number; name: string; kind: string }] }>();

const { t } = useI18n();
const { payload } = useProfileData();
const inventory = useInventory();

const KIND_OPTIONS = InventoryKindSchema.options;
const activeKind = ref<string>(props.kind ?? 'all');
const selected = ref<CatalogItem | null>(null);
const fields = computed(() => itemFormFields(selected.value?.kind ?? activeKind.value));
const kindOptions = computed<{ label: string; value: string }[]>(() => [
  { label: t('inventory.filter.allKinds'), value: 'all' },
  ...KIND_OPTIONS.map((kind) => ({ label: t(`inventory.filterKinds.${kind}`), value: kind })),
]);

interface CatalogItem {
  id: number;
  name: string;
  kind: string;
  category: string | null;
  rank: string | null;
  slot: string | null;
}

const search = ref('');
const debouncedSearch = ref('');

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

const request = useRequestFetch();
const { data: itemsPage, isLoading: loading, refetch: refetchItems } = useQuery({
  key: () => ['catalog', 'items', activeKind.value, debouncedSearch.value],
  query: () =>
    request<CatalogItem[]>('/api/v1/items', {
      query: {
        q: debouncedSearch.value || undefined,
        ...(activeKind.value === 'all' ? {} : { kind: activeKind.value }),
        limit: 20,
      },
    }),
  enabled: () => open.value,
});
/** Only the seven ownable kinds reach the form; motifs stay catalog-only. */
const items = computed(() =>
  (itemsPage.value ?? []).filter((item) => (InventoryKindSchema.options as readonly string[]).includes(item.kind)),
);

const { data: motifs } = useQuery({
  key: ['catalog', 'motifs'],
  query: () => request<{ name: string; baseItemId?: number | null }[]>('/api/v1/items', {
    query: { kind: 'motif', limit: 200 },
  }),
  enabled: () => open.value && fields.value.skin,
});
const skinItems = computed(() => skinsFor(motifs.value ?? [], selected.value?.id));

let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));

watch(search, () => {
  selected.value = null;
  clearTimeout(timer);
  timer = setTimeout(() => {
    debouncedSearch.value = search.value.trim();
  }, 250);
});

watch(open, (value) => {
  if (value) reset();
});

function reset(): void {
  search.value = '';
  selected.value = null;
  form.level = 0;
  form.qty = 1;
  form.rarityPct = null;
  form.skin = undefined;
  form.virtual = false;
  if (props.kind) activeKind.value = props.kind;
  else activeKind.value = 'all';
  debouncedSearch.value = '';
  void refetchItems();
}

/** Choosing a row fixes the kind for the rest of the form. */
function choose(item: CatalogItem): void {
  selected.value = item;
  activeKind.value = item.kind;
}

async function submit(): Promise<void> {
  const item = selected.value;
  if (!item) return;

  const body = itemCreatePayload(item.kind, item, form);
  const result = await inventory.addItem(body);
  if (!result) return;

  const instanceId = (result.diff.after as { id?: number | null } | null)?.id;
  open.value = false;
  emit('saved');
  if (instanceId) emit('created', { instanceId, name: item.name, kind: item.kind });
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('owned.addTitle')"
    :description="t('owned.addDescription')"
    :ui="{ content: MODAL_WIDTH.form }"
    scrollable
  >
    <template #body>
      <div v-if="catalogEmpty" class="space-y-3">
        <UAlert color="warning" variant="subtle" icon="i-lucide-package-x" :title="t('owned.catalogRequired')" />
        <UButton to="/settings" :label="t('owned.catalogRequiredAction')" />
      </div>

      <UForm v-else :state="form" class="space-y-4" @submit="submit">
        <UFormField v-if="!kind" :label="t('owned.kindLabel')" name="kind">
          <USelect v-model="activeKind" :items="kindOptions" class="w-full" />
        </UFormField>

        <UFormField :label="t('owned.item')" name="item">
          <UInput v-model="search" :placeholder="t('owned.searchItem')" icon="i-lucide-search" class="w-full" />
        </UFormField>

        <div class="max-h-56 overflow-y-auto border border-[var(--sz-border)]">
          <p v-if="loading" class="px-3 py-2 text-[12px] text-[var(--sz-text-muted)]">{{ t('common.loading') }}</p>
          <p v-else-if="!items.length" class="px-3 py-2 text-[12px] text-[var(--sz-text-muted)]">
            {{ t('owned.noItems') }}
          </p>
          <template v-else>
            <button
              v-for="item in items"
              :key="item.id"
              type="button"
              class="flex w-full items-center justify-between gap-2 border-b border-[var(--sz-border)] px-3 py-2 text-left text-[13px] last:border-b-0"
              :class="
                selected?.id === item.id
                  ? 'bg-[var(--sz-surface-alt)] text-[var(--sz-accent)]'
                  : 'hover:bg-[var(--sz-surface-alt)]'
              "
              @click="choose(item)"
            >
              <span class="min-w-0">
                <span class="block truncate">{{ item.name }}</span>
                <span class="block truncate text-[11px] text-[var(--sz-text-dim)]">
                  {{ t(`inventory.filterKinds.${item.kind}`) }}<template v-if="item.category"> · {{ item.category }}</template>
                </span>
              </span>
              <span class="shrink-0 text-[11px] text-[var(--sz-text-dim)]">{{ item.rank ?? '' }}</span>
            </button>
          </template>
        </div>

        <div v-if="selected" class="space-y-3">
          <dl class="grid gap-x-4 gap-y-1 text-[12px] sm:grid-cols-2">
            <div class="flex justify-between gap-2">
              <dt class="text-[var(--sz-text-muted)]">{{ t('owned.kindLabel') }}</dt>
              <dd>{{ t(`inventory.filterKinds.${selected.kind}`) }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-[var(--sz-text-muted)]">{{ t('forms.category') }}</dt>
              <dd class="truncate">{{ selected.category ?? '—' }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-[var(--sz-text-muted)]">{{ t('forms.slot') }}</dt>
              <dd>{{ selected.slot ?? t('forms.slotUnknown') }}</dd>
            </div>
          </dl>

          <div class="grid gap-3 sm:grid-cols-2">
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
            <UFormField name="virtual" class="col-span-2">
              <USwitch v-model="form.virtual" :label="t('forms.virtual')" />
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
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <UButton type="button" color="neutral" variant="ghost" :label="t('common.cancel')" @click="open = false" />
          <UButton
            type="submit"
            :loading="inventory.busy.value"
            :disabled="!selected"
            :label="t('owned.add')"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
