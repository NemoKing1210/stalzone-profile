<script setup lang="ts">
import type { InventoryItemRead, ModificationSlot } from '@profile/shared/contracts';

import { ItemCard } from '~/entities/item';
import { MODAL_WIDTH } from '~/shared/lib/modalWidth';
import { allInventoryItems } from '~/shared/lib/inventory';
import { catalogKey, catalogRow, findInstance, rowOnlyKind } from '~/shared/lib/itemModal';
import { KeyHint } from '~/shared/ui';
import { useItemModalStore } from '~/stores/itemModal';
import { useProfileData } from '~/stores/profile-data';

import { useInventory } from '../model/useInventory';
import ItemDetailsModal from './ItemDetailsModal.vue';

const store = useItemModalStore();
const { payload } = useProfileData();
const inventory = useInventory();
const { t } = useI18n();
const toast = useToast();
const request = useRequestFetch();

const target = computed(() => store.target);
const fetchedInstance = ref<InventoryItemRead | null>(null);
const fetchedCard = ref<Record<string, unknown> | null>(null);

const items = computed(() => allInventoryItems(payload.value?.inventory));
const modifications = computed(() => items.value.filter((item) => item.kind === 'modification'));
const artifacts = computed(() => items.value.filter((item) => item.kind === 'artifact'));

const instance = computed<InventoryItemRead | null>(() => {
  const current = target.value;
  if (!current || current.mode !== 'instance') return null;
  return findInstance(payload.value?.inventory, current.instanceId) ?? fetchedInstance.value;
});

const row = computed(() => (target.value?.mode === 'catalog' ? catalogRow(target.value) : null));
const card = computed(() => (target.value?.mode === 'catalog' ? fetchedCard.value : null));
const kind = computed(() => instance.value?.kind ?? target.value?.kind ?? 'other');
const name = computed(() => {
  const current = target.value;
  if (!current) return '';
  if (current.mode === 'catalog') return current.name;
  return instance.value?.displayName ?? instance.value?.name ?? '';
});

/** The modal waits for its data: an instance from the payload or the API, a catalog card. */
const ready = computed(() => {
  const current = target.value;
  if (!current) return false;
  if (current.mode === 'instance') return instance.value != null;
  return card.value != null || rowOnlyKind(current.kind);
});
const open = computed({
  get: () => ready.value,
  set: (value: boolean) => {
    if (!value) store.close();
  },
});

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const value = error as { statusCode?: number; status?: number; response?: { status?: number } };
  return value.statusCode ?? value.status ?? value.response?.status ?? null;
}

function fail(title: string): void {
  store.close();
  toast.add({ title, color: 'warning', icon: 'i-lucide-search-x' });
}

watch(
  target,
  async (current) => {
    fetchedInstance.value = null;
    fetchedCard.value = null;
    if (!current) return;
    try {
      if (current.mode === 'instance') {
        if (findInstance(payload.value?.inventory, current.instanceId)) return;
        fetchedInstance.value = await request<InventoryItemRead>(`/api/v1/inventory/items/${current.instanceId}`);
        return;
      }
      const key = catalogKey(current.kind, current.name);
      if (!key) {
        // Gadget rows have no detail card; their row alone is the card.
        if (rowOnlyKind(current.kind)) return;
        fail(t('errors.ITEM_NOT_FOUND'));
        return;
      }
      const response = await request<{ data?: Record<string, unknown> }>(
        `/api/v1/details/${encodeURIComponent(key)}`,
      );
      if (!response?.data) {
        fail(t('errors.DETAIL_NOT_FOUND'));
        return;
      }
      fetchedCard.value = response.data;
    } catch (error) {
      const status = statusOf(error);
      if (status === 404) fail(t(current.mode === 'instance' ? 'errors.ITEM_NOT_FOUND' : 'errors.DETAIL_NOT_FOUND'));
      else fail(t('errors.generic'));
    }
  },
  { immediate: true },
);

async function update(patch: Record<string, unknown>): Promise<void> {
  const item = instance.value;
  if (item) await inventory.updateItem(item.id, patch);
}

async function remove(qty: number): Promise<void> {
  const item = instance.value;
  if (!item) return;
  const result = await inventory.removeItem(item.id, qty);
  if (result && qty >= item.qty) store.close();
}

const pendingUnverified = ref<{ weaponId: number; slot: ModificationSlot; modificationItemId: number } | null>(null);

async function install(slot: ModificationSlot, modificationItemId: number | null): Promise<void> {
  const weapon = instance.value;
  if (weapon?.kind !== 'weapon') return;
  const result = await inventory.setWeaponModification(weapon.id, slot, modificationItemId);
  if (!result && modificationItemId != null && inventory.lastError.value?.code === 'INCOMPATIBLE_MODIFICATION') {
    pendingUnverified.value = { weaponId: weapon.id, slot, modificationItemId };
  }
}

async function confirmUnverified(): Promise<void> {
  const pending = pendingUnverified.value;
  pendingUnverified.value = null;
  if (pending) await inventory.setWeaponModification(pending.weaponId, pending.slot, pending.modificationItemId, true);
}

async function fill(slots: (number | null)[]): Promise<void> {
  const container = instance.value;
  if (container?.kind !== 'container') return;
  await inventory.setContainerFill(container.id, slots);
}

/**
 * The artifact card opened from a container must live beside the item modal: closing one
 * unmounts its body, and a nested modal would go with it.
 */
const artifactTarget = ref<{ name: string; level: number } | null>(null);
const artifactCard = ref<Record<string, unknown> | null>(null);

async function openArtifact(name: string, level: number): Promise<void> {
  artifactTarget.value = { name, level };
  artifactCard.value = null;
  store.close();
  try {
    const response = await request<{ data?: Record<string, unknown> }>(
      `/api/v1/details/${encodeURIComponent(`art:${name}`)}`,
    );
    if (!artifactTarget.value || artifactTarget.value.name !== name) return;
    artifactCard.value = response?.data ?? null;
  } catch {
    artifactCard.value = null;
  }
}
</script>

<template>
  <ItemDetailsModal
    v-model:open="open"
    :kind="kind"
    :name="name"
    :item="instance"
    :card="card"
    :row="row"
    :modifications="modifications"
    :artifacts="artifacts"
    :busy="inventory.busy.value"
    @update="update"
    @remove="remove"
    @install="install"
    @fill="fill"
    @artifact="openArtifact"
  />

  <UModal
    :open="Boolean(pendingUnverified)"
    :title="t('inventory.unverifiedTitle')"
    :ui="{ content: MODAL_WIDTH.narrow }"
    @update:open="(value) => !value && (pendingUnverified = null)"
  >
    <template #body>
      <p class="text-[12.5px]">{{ t('inventory.unverifiedDesc') }}</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="pendingUnverified = null" />
        <UButton :loading="inventory.busy.value" :label="t('inventory.unverifiedConfirm')" @click="confirmUnverified" />
      </div>
    </template>
  </UModal>

  <UModal
    :open="artifactTarget !== null"
    :title="t('items.artifactCardTitle')"
    :description="artifactTarget?.name"
    :ui="{ content: MODAL_WIDTH.reader }"
    scrollable
    @update:open="(value) => !value && (artifactTarget = null)"
  >
    <template #body>
      <ItemCard
        v-if="artifactTarget"
        :name="artifactTarget.name"
        kind="artifact"
        :data="{ name: artifactTarget.name, lvl: artifactTarget.level }"
        :card="artifactCard"
        :level="artifactTarget.level"
      />
    </template>
    <template #footer>
      <KeyHint :keys="['Esc']" :label="t('common.close')" />
    </template>
  </UModal>
</template>
