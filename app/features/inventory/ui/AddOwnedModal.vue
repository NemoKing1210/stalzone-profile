<script setup lang="ts">
import { useQuery } from '@pinia/colada';
import type { OwnedKind } from '~/shared/types/profile';
import { MODAL_WIDTH } from '~/shared/lib/modalWidth';
import { useProfileData } from '~/stores/profile-data';
import type { WriteResult } from '@profile/shared/contracts';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ kind: OwnedKind }>();
const emit = defineEmits<{ saved: []; created: [{ instanceId: number; name: string; kind: OwnedKind }] }>();

const { t } = useI18n();
const { write, busy } = useWrite();
const { payload } = useProfileData();

interface CatalogItem {
  id: number;
  name: string;
  rank: string | null;
  slot: string | null;
}

const search = ref('');
const debouncedSearch = ref('');
const selected = ref<CatalogItem | null>(null);

const form = reactive({
  level: 0,
  qty: 1,
  quality: null as string | null | undefined,
  skin: undefined as string | undefined,
  role: null as string | null | undefined,
  slot: null as string | null | undefined,
  note: null as string | null | undefined,
});

const catalogEmpty = computed(() => {
  const meta = payload.value?.catalog?.meta as { items?: number } | undefined;
  return Number(meta?.items ?? 0) === 0;
});

const request = useRequestFetch();
const { data: itemsPage, isLoading: loading, refetch: refetchItems } = useQuery({
  key: () => ['catalog', 'items', props.kind, debouncedSearch.value],
  query: () =>
    request<CatalogItem[]>('/api/v1/items', {
      query: { q: debouncedSearch.value || undefined, kind: props.kind, limit: 20 },
    }),
  enabled: () => open.value,
});
const items = computed(() => itemsPage.value ?? []);

const { data: motifs } = useQuery({
  key: ['catalog', 'motifs'],
  query: () => request<{ name: string }[]>('/api/v1/items', { query: { kind: 'motif', limit: 200 } }),
  enabled: () => open.value,
});
const skinItems = computed(() => (motifs.value ?? []).map((motif) => motif.name));
/** Skins belong to weapons and armor; containers and artifacts have none. */
const hasSkins = computed(() => props.kind === 'weapon' || props.kind === 'armor');

let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));

watch(search, () => {
  // A different query means a different result list; the old pick must not stay armed.
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
  form.quality = null;
  form.skin = undefined;
  form.role = null;
  form.slot = null;
  form.note = null;
  debouncedSearch.value = '';
  void refetchItems();
}

async function submit(): Promise<void> {
  const item = selected.value;
  if (!item) return;

  const result = await write<WriteResult>('/api/v1/inventory/items', {
    method: 'POST',
    body: {
      name: item.name,
      kind: props.kind,
      level: form.level,
      qty: form.qty,
      quality: form.quality ?? null,
      skin: hasSkins.value ? (form.skin ?? null) : null,
      role: props.kind === 'weapon' ? (form.role ?? null) : null,
      slot: props.kind === 'weapon' ? (form.slot ?? null) : null,
      note: form.note ?? null,
      dryRun: false,
    },
  });
  if (!result) return;

  const instanceId = (result.diff.after as { id?: number | null } | null)?.id;
  open.value = false;
  emit('saved');
  if (instanceId) emit('created', { instanceId, name: item.name, kind: props.kind });
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
              @click="selected = item"
            >
              <span class="min-w-0 truncate">{{ item.name }}</span>
              <span class="shrink-0 text-[11px] text-[var(--sz-text-dim)]">{{ item.rank ?? '' }}</span>
            </button>
          </template>
        </div>

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
          <UFormField v-if="hasSkins" :label="t('forms.skin')" name="skin">
            <USelectMenu
              v-model="form.skin"
              :items="skinItems"
              searchable
              clearable
              :placeholder="t('forms.noSkin')"
              class="w-full"
            />
          </UFormField>
          <template v-if="kind === 'weapon'">
            <UFormField :label="t('forms.role')" name="role">
              <UInput v-model.nullable="form.role" :placeholder="t('forms.rolePlaceholder')" class="w-full" />
            </UFormField>
            <UFormField :label="t('forms.slot')" name="slot">
              <UInput v-model.nullable="form.slot" :placeholder="t('forms.slotPlaceholder')" class="w-full" />
            </UFormField>
          </template>
        </div>

        <UFormField :label="t('forms.note')" name="note">
          <UTextarea v-model.nullable="form.note" :rows="2" class="w-full" />
        </UFormField>

        <div class="flex justify-end gap-2">
          <UButton type="button" color="neutral" variant="ghost" :label="t('common.cancel')" @click="open = false" />
          <UButton type="submit" :loading="busy" :disabled="!selected" :label="t('owned.add')" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
