<script setup lang="ts">
import type { StorageRead } from '@profile/shared/contracts';

const props = withDefaults(
  defineProps<{
    stashes: StorageRead[];
    selectedId?: number | null;
    busy?: boolean;
    /** New stash defaults. */
    defaultWidth?: number;
    defaultHeight?: number;
  }>(),
  { selectedId: null, busy: false, defaultWidth: 8, defaultHeight: 10 },
);

const emit = defineEmits<{
  select: [id: number];
  create: [input: { name: string; width: number; height: number }];
  update: [id: number, patch: { name?: string; width?: number; height?: number; maxWeight?: number | null }];
  remove: [id: number, moveToStorageId: number | null];
  close: [];
}>();

const { t } = useI18n();

const selected = computed(() => props.stashes.find((stash) => stash.id === props.selectedId) ?? null);

const form = reactive({ name: '', width: 8, height: 10, maxWeight: '' as number | string });
const created = reactive({ name: '', width: props.defaultWidth, height: props.defaultHeight });

function fill(): void {
  const stash = selected.value;
  form.name = stash?.name ?? '';
  form.width = stash?.width ?? props.defaultWidth;
  form.height = stash?.height ?? props.defaultHeight;
  form.maxWeight = stash?.maxWeight ?? '';
}

watch(() => props.selectedId, fill, { immediate: true });
watch(() => props.stashes, fill);

const changed = computed(() => {
  const stash = selected.value;
  if (!stash) return false;
  const maxWeight = form.maxWeight === '' ? null : Number(form.maxWeight);
  return (
    form.name.trim() !== stash.name ||
    Number(form.width) !== stash.width ||
    Number(form.height) !== stash.height ||
    maxWeight !== stash.maxWeight
  );
});

function save(): void {
  const stash = selected.value;
  if (!stash) return;
  const patch: { name?: string; width?: number; height?: number; maxWeight?: number | null } = {};
  if (form.name.trim() && form.name.trim() !== stash.name) patch.name = form.name.trim();
  if (Number(form.width) !== stash.width) patch.width = Number(form.width);
  if (Number(form.height) !== stash.height) patch.height = Number(form.height);
  const maxWeight = form.maxWeight === '' ? null : Number(form.maxWeight);
  if (maxWeight !== stash.maxWeight) patch.maxWeight = maxWeight;
  if (Object.keys(patch).length) emit('update', stash.id, patch);
}

function create(): void {
  const name = created.name.trim();
  if (!name) return;
  emit('create', { name, width: Number(created.width), height: Number(created.height) });
  created.name = '';
  created.width = props.defaultWidth;
  created.height = props.defaultHeight;
}

/* Deleting a stash returns its items to loose unless another stash is chosen. */
const confirmOpen = ref(false);
const moveTo = ref<number | 'loose'>('loose');
const otherStashes = computed(() => props.stashes.filter((stash) => stash.id !== props.selectedId));

function askDelete(): void {
  moveTo.value = 'loose';
  confirmOpen.value = true;
}

function confirmDelete(): void {
  const stash = selected.value;
  if (!stash) return;
  confirmOpen.value = false;
  emit('remove', stash.id, moveTo.value === 'loose' ? null : moveTo.value);
}
</script>

<template>
  <div class="space-y-4">
    <section class="space-y-1">
      <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.storages') }}</h3>
      <div v-if="props.stashes.length" class="flex flex-wrap gap-1">
        <button
          v-for="stash in props.stashes"
          :key="stash.id"
          type="button"
          class="border px-2 py-0.5 text-[11.5px]"
          :class="
            stash.id === props.selectedId
              ? 'border-[var(--sz-accent)] bg-ink-700 text-[var(--sz-text)]'
              : 'border-[var(--sz-border)] bg-ink-800 text-[var(--sz-text-muted)] hover:bg-ink-700'
          "
          @click="emit('select', stash.id)"
        >
          {{ stash.name }}
          <span class="tabular-nums text-[10px] text-[var(--sz-text-dim)]">
            {{ stash.width }}×{{ stash.height }}
          </span>
        </button>
      </div>
      <p v-else class="text-[11.5px] text-[var(--sz-text-dim)]">{{ t('inventory.noStash') }}</p>
    </section>

    <section v-if="selected" class="space-y-2">
      <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.stashSettings') }}</h3>
      <div class="grid grid-cols-2 gap-2">
        <label class="col-span-2 block text-[11px] text-[var(--sz-text-muted)]">
          {{ t('inventory.stashName') }}
          <UInput v-model="form.name" size="xs" class="mt-0.5 w-full" :maxlength="200" />
        </label>
        <label class="block text-[11px] text-[var(--sz-text-muted)]">
          {{ t('inventory.width') }}
          <UInput v-model.number="form.width" type="number" size="xs" class="mt-0.5 w-full" :min="1" :max="40" />
        </label>
        <label class="block text-[11px] text-[var(--sz-text-muted)]">
          {{ t('inventory.height') }}
          <UInput v-model.number="form.height" type="number" size="xs" class="mt-0.5 w-full" :min="1" :max="80" />
        </label>
        <label class="col-span-2 block text-[11px] text-[var(--sz-text-muted)]">
          {{ t('inventory.maxWeight') }}
          <UInput
            v-model.number="form.maxWeight"
            type="number"
            size="xs"
            class="mt-0.5 w-full"
            :min="0"
            :placeholder="t('inventory.noLimit')"
          />
        </label>
      </div>
      <p class="text-[10.5px] text-[var(--sz-text-dim)]">{{ t('inventory.resizeHint') }}</p>
      <div class="flex flex-wrap justify-between gap-1">
        <UButton
          size="xs"
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          :label="t('inventory.deleteStash')"
          :disabled="props.busy"
          @click="askDelete"
        />
        <UButton size="xs" :label="t('common.save')" :loading="props.busy" :disabled="!changed" @click="save" />
      </div>
    </section>

    <section class="space-y-2 border-t border-[var(--sz-border)] pt-3">
      <h3 class="sz-caps text-[10.5px] text-[var(--sz-text-muted)]">{{ t('inventory.newStash') }}</h3>
      <div class="grid grid-cols-2 gap-2">
        <label class="col-span-2 block text-[11px] text-[var(--sz-text-muted)]">
          {{ t('inventory.stashName') }}
          <UInput v-model="created.name" size="xs" class="mt-0.5 w-full" :maxlength="200" />
        </label>
        <label class="block text-[11px] text-[var(--sz-text-muted)]">
          {{ t('inventory.width') }}
          <UInput v-model.number="created.width" type="number" size="xs" class="mt-0.5 w-full" :min="1" :max="40" />
        </label>
        <label class="block text-[11px] text-[var(--sz-text-muted)]">
          {{ t('inventory.height') }}
          <UInput v-model.number="created.height" type="number" size="xs" class="mt-0.5 w-full" :min="1" :max="80" />
        </label>
      </div>
      <UButton
        size="xs"
        icon="i-lucide-plus"
        :label="t('inventory.createStash')"
        :loading="props.busy"
        :disabled="!created.name.trim()"
        @click="create"
      />
    </section>

    <UModal v-model:open="confirmOpen" :title="t('inventory.deleteStashTitle')">
      <template #body>
        <div class="space-y-3 text-[12.5px]">
          <p>{{ t('inventory.deleteStashDesc', { name: selected?.name ?? '' }) }}</p>
          <div v-if="selected?.items.length" class="space-y-1">
            <p class="text-[11px] text-[var(--sz-text-muted)]">{{ t('inventory.deleteStashItems') }}</p>
            <ul class="max-h-40 overflow-auto border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2 py-1">
              <li v-for="item in selected.items" :key="item.id" class="truncate text-[11.5px]">
                {{ item.name }}<template v-if="item.qty > 1"> ×{{ item.qty }}</template>
              </li>
            </ul>
          </div>
          <label v-if="otherStashes.length" class="block text-[11px] text-[var(--sz-text-muted)]">
            {{ t('inventory.deleteStashMoveTo') }}
            <USelect
              v-model="moveTo"
              class="mt-0.5 w-full"
              size="xs"
              :items="[
                { label: t('inventory.deleteStashLoose'), value: 'loose' },
                ...otherStashes.map((stash) => ({ label: stash.name, value: stash.id })),
              ]"
            />
          </label>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="confirmOpen = false" />
          <UButton color="error" :loading="props.busy" :label="t('common.delete')" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
