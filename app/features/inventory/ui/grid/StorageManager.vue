<script setup lang="ts">
import type { StorageRead } from '@profile/shared/contracts';

import { storageLabel } from '../../model/labels';
import { stashCreateInput, stashPatchInput } from '../../model/stashForm';
import { MODAL_WIDTH } from '~/shared/lib/modalWidth';

const props = withDefaults(
  defineProps<{
    stashes: StorageRead[];
    selectedId?: number | null;
    busy?: boolean;
  }>(),
  { selectedId: null, busy: false },
);

const emit = defineEmits<{
  select: [id: number];
  create: [input: { name: string }];
  update: [id: number, patch: { name?: string; maxWeight?: number | null }];
  remove: [id: number];
  close: [];
}>();

const { t } = useI18n();

const selected = computed(() => props.stashes.find((stash) => stash.id === props.selectedId) ?? null);

const form = reactive({ name: '', maxWeight: '' as number | string });
const created = reactive({ name: '' });

function fill(): void {
  const stash = selected.value;
  form.name = stash?.name ?? '';
  form.maxWeight = stash?.maxWeight ?? '';
}

watch(() => props.selectedId, fill, { immediate: true });
watch(() => props.stashes, fill);

const patch = computed(() => {
  const stash = selected.value;
  return stash
    ? stashPatchInput({ name: form.name, maxWeight: form.maxWeight }, { name: stash.name, maxWeight: stash.maxWeight })
    : {};
});
const changed = computed(() => Object.keys(patch.value).length > 0);

function save(): void {
  const stash = selected.value;
  if (!stash || !changed.value) return;
  emit('update', stash.id, patch.value);
}

function create(): void {
  const input = stashCreateInput(created);
  if (!input.name) return;
  emit('create', input);
  created.name = '';
}

/* Deleting a stash moves its items to the intake stash. */
const confirmOpen = ref(false);

function askDelete(): void {
  confirmOpen.value = true;
}

function confirmDelete(): void {
  const stash = selected.value;
  if (!stash) return;
  confirmOpen.value = false;
  emit('remove', stash.id);
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
          {{ storageLabel(stash, t) }}
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
      <p class="text-[10.5px] text-[var(--sz-text-dim)]">{{ t('inventory.fixedSizeHint') }}</p>
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

    <UModal
      v-model:open="confirmOpen"
      :title="t('inventory.deleteStashTitle')"
      :ui="{ content: MODAL_WIDTH.narrow }"
    >
      <template #body>
        <div class="space-y-3 text-[12.5px]">
          <p>{{ t('inventory.deleteStashDesc', { name: selected ? storageLabel(selected, t) : '' }) }}</p>
          <p class="text-[11px] text-[var(--sz-text-muted)]">{{ t('inventory.deleteStashToOverflow') }}</p>
          <div v-if="selected?.items.length" class="space-y-1">
            <p class="text-[11px] text-[var(--sz-text-muted)]">{{ t('inventory.deleteStashItems') }}</p>
            <ul class="max-h-40 overflow-auto border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2 py-1">
              <li v-for="item in selected.items" :key="item.id" class="truncate text-[11.5px]">
                {{ item.name }}<template v-if="item.qty > 1"> ×{{ item.qty }}</template>
              </li>
            </ul>
          </div>
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
