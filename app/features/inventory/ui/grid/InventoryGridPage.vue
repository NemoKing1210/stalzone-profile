<script setup lang="ts">
import type { InventoryItemRead, ModuleSlot, StorageRead } from '@profile/shared/contracts';

import { ConfirmActionModal, ProfilePane } from '~/shared/ui';
import type { DropTarget } from '../../model/drag';
import { storageLabel } from '../../model/labels';
import type { ItemMenuAction } from '../../model/menu';
import { useInventory } from '../../model/useInventory';
import ContainerPanel from './ContainerPanel.vue';
import WeightHud from './WeightHud.vue';
import DragPreview from './DragPreview.vue';
import EquipmentDoll from './EquipmentDoll.vue';
import ItemDetailsPanel from './ItemDetailsPanel.vue';
import ItemGrid from './ItemGrid.vue';
import LoadoutPanel from './LoadoutPanel.vue';
import StorageManager from './StorageManager.vue';
import WeaponPanel from './WeaponPanel.vue';
import { provideGridDrag } from './drag-context';
import { useGridDrag } from './useGridDrag';

const { t } = useI18n();
const toast = useToast();
useHead(() => ({ title: `${t('inventory.title')} // ${t('common.appName')}` }));

const inventory = useInventory();
const { place: playPlace } = useUiSounds();
/** Catalog cards behind the instances: the tiles read type and caliber from them. */
const { payload } = useProfile();
const details = computed(() => payload.value?.details ?? null);

/* ------------------------------------------------------------------ */
/* Drag state shared by both grids, the paper-doll and the panels      */
/* ------------------------------------------------------------------ */

const drag = useGridDrag({
  onDrop: (itemId, target) => dropItem(itemId, target),
  storageFor: (storageId) => inventory.storages.value.find((entry) => entry.id === storageId) ?? null,
  onDropRejected: () =>
    toast.add({
      title: t('inventory.dropBlocked'),
      color: 'warning',
      icon: 'i-lucide-ban',
    }),
  homeStorageId: () => inventory.inventoryStorage.value?.id ?? null,
  intakeStorageId: () => inventory.overflow.value?.id ?? null,
});

// The preview, the ghosts and the slot highlights read this context themselves, so a
// pointer move repaints those components and not the whole screen.
provideGridDrag(drag);

async function dropItem(itemId: number, target: DropTarget): Promise<void> {
  // The screen already shows the landing before the write settles; the thud belongs to
  // that optimistic placement, and a server rejection still reverts the state with a toast.
  playPlace();
  await inventory.move(itemId, target);
}

function selectItem(item: InventoryItemRead): void {
  if (drag.shouldIgnoreClick() || drag.picked.value) return;
  selectedId.value = item.id;
  detailsOpen.value = true;
}

function pickItem(item: InventoryItemRead, event: KeyboardEvent): void {
  // While something is picked the global key handler owns Enter/Space (drop or cancel).
  if (drag.picked.value) return;
  drag.start(item, event);
}

/** Context-menu commands: the screen owns every write, the menu only names the intent. */
function itemMenu(item: InventoryItemRead, action: ItemMenuAction): void {
  switch (action.kind) {
    case 'details':
      selectItem(item);
      break;
    case 'container':
      openContainer(item.id);
      break;
    case 'weapon':
      openWeapon(item.id);
      break;
    case 'move':
      void inventory.move(item.id, action.target);
      break;
    case 'remove':
      removal.value = item;
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Item lookup: the payload refreshes after every write, so keep ids   */
/* ------------------------------------------------------------------ */

const selectedId = ref<number | null>(null);
const detailsOpen = ref(false);
const containerId = ref<number | null>(null);
const containerOpen = ref(false);
const weaponId = ref<number | null>(null);
const weaponOpen = ref(false);
const storageOpen = ref(false);
const removal = ref<InventoryItemRead | null>(null);

function flatten(item: InventoryItemRead, into: Map<number, InventoryItemRead>): void {
  into.set(item.id, item);
  for (const child of [...(item.artifacts ?? []), ...(item.modules ?? [])]) flatten(child, into);
}

const itemMap = computed(() => {
  const map = new Map<number, InventoryItemRead>();
  for (const item of Object.values(inventory.equipment.value ?? {})) if (item) flatten(item, map);
  for (const item of inventory.loose.value) flatten(item, map);
  for (const storage of inventory.storages.value) for (const item of storage.items) flatten(item, map);
  return map;
});

const allItems = computed(() => [...itemMap.value.values()]);
const selectedItem = computed(() => (selectedId.value == null ? null : (itemMap.value.get(selectedId.value) ?? null)));
const containerItem = computed(() => (containerId.value == null ? null : (itemMap.value.get(containerId.value) ?? null)));
const weaponItem = computed(() => (weaponId.value == null ? null : (itemMap.value.get(weaponId.value) ?? null)));
const openContainerItem = computed(() => (containerOpen.value ? containerItem.value : null));
const openWeaponItem = computed(() => (weaponOpen.value ? weaponItem.value : null));

const artifactCandidates = computed(() => allItems.value.filter((item) => item.kind === 'artifact'));
const attachmentCandidates = computed(() => allItems.value.filter((item) => item.kind === 'attachment'));

watch(selectedItem, (item) => {
  if (!item) detailsOpen.value = false;
});
watch(containerItem, (item) => {
  if (!item) containerOpen.value = false;
});
watch(weaponItem, (item) => {
  if (!item) weaponOpen.value = false;
});

function openContainer(id: number): void {
  containerId.value = id;
  containerOpen.value = true;
}

function openWeapon(id: number): void {
  weaponId.value = id;
  weaponOpen.value = true;
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

async function updateSelected(patch: Record<string, unknown>): Promise<void> {
  const item = selectedItem.value;
  if (item) await inventory.updateItem(item.id, patch);
}

async function removeSelected(): Promise<void> {
  const item = selectedItem.value;
  if (!item) return;
  const result = await inventory.removeItem(item.id);
  if (result) {
    detailsOpen.value = false;
    selectedId.value = null;
  }
}

async function confirmRemoval(): Promise<void> {
  const item = removal.value;
  if (!item) return;
  const result = await inventory.removeItem(item.id);
  if (!result) return;
  removal.value = null;
  if (selectedId.value === item.id) {
    detailsOpen.value = false;
    selectedId.value = null;
  }
}

async function applyFill(slots: (number | null)[]): Promise<void> {
  if (containerId.value == null) return;
  await inventory.setContainerFill(containerId.value, slots);
}

const pendingUnverified = ref<{ weaponId: number; slot: ModuleSlot; attachmentItemId: number } | null>(null);

async function installModule(slot: ModuleSlot, attachmentItemId: number | null): Promise<void> {
  const weapon = weaponItem.value;
  if (!weapon) return;
  const result = await inventory.setWeaponModule(weapon.id, slot, attachmentItemId);
  if (
    !result &&
    attachmentItemId != null &&
    inventory.lastError.value?.code === 'INCOMPATIBLE_ATTACHMENT'
  ) {
    pendingUnverified.value = { weaponId: weapon.id, slot, attachmentItemId };
  }
}

async function confirmUnverified(): Promise<void> {
  const pending = pendingUnverified.value;
  pendingUnverified.value = null;
  if (pending) await inventory.setWeaponModule(pending.weaponId, pending.slot, pending.attachmentItemId, true);
}

/* ------------------------------------------------------------------ */
/* Stashes                                                             */
/* ------------------------------------------------------------------ */

const storageOptions = computed(() =>
  [inventory.overflow.value, ...inventory.stashes.value]
    .filter((storage): storage is StorageRead => storage !== null)
    .map((storage) => ({ label: storageLabel(storage, t), value: storage.id })),
);
const storageId = computed<number | undefined>({
  get: () => inventory.selectedStorage.value?.id,
  set: (value) => inventory.selectStorage(value ?? null),
});

async function createStash(input: { name: string; width: number; height: number }): Promise<void> {
  await inventory.createStorage(input);
}

async function updateStash(
  id: number,
  patch: { name?: string; width?: number; height?: number; maxWeight?: number | null },
): Promise<void> {
  await inventory.updateStorage(id, patch);
}

async function removeStash(id: number): Promise<void> {
  const result = await inventory.deleteStorage(id);
  if (result) inventory.selectStorage(null);
}

function selectStash(id: number): void {
  inventory.selectStorage(id);
}

async function arrange(): Promise<void> {
  const storage = inventory.selectedStorage.value;
  if (storage?.kind === 'stash') await inventory.autoArrange(storage.id);
}

/** Container names for the loadout panel; every container can live in equipment, a grid or the tray. */
const containerNames = computed<Record<number, string>>(() => {
  const names: Record<number, string> = {};
  for (const item of allItems.value) if (item.kind === 'container') names[item.id] = item.name;
  return names;
});
</script>

<template>
  <section class="space-y-3">
    <DragPreview :details="details" />
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{{ t('inventory.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('inventory.summary') }}</p>
        <p class="text-[11px] text-[var(--sz-text-muted)]">{{ t('inventory.menuHint') }}</p>
      </div>
      <p v-if="drag.picked.value" class="text-[11px] text-[var(--sz-text-muted)]">
        {{ t('inventory.dragHint') }}
      </p>
    </div>

    <UEmpty
      v-if="!inventory.inventoryStorage.value"
      icon="i-lucide-package-x"
      :title="t('inventory.title')"
      :description="t('inventory.noInventory')"
    >
      <template #actions>
        <UButton to="/setup" color="neutral" variant="outline" :label="t('inventory.openSetup')" />
      </template>
    </UEmpty>

    <template v-else>
      <div class="grid items-start gap-3 xl:grid-cols-2">
        <div class="min-w-0 space-y-3">
          <ProfilePane :title="t('inventory.equipment')">
            <EquipmentDoll
              :equipment="inventory.equipment.value"
              :storages="inventory.storages.value"
              :busy="inventory.busy.value"
              :attach-tile="drag.attachTile"
              @select="selectItem"
              @pick="pickItem"
              @menu="itemMenu"
            />
          </ProfilePane>

          <ProfilePane v-if="openContainerItem" :title="openContainerItem.name" dense>
            <template #actions>
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                :aria-label="t('common.close')"
                @click="containerOpen = false"
              />
            </template>
            <ContainerPanel
              :container="openContainerItem"
              :candidates="artifactCandidates"
              :busy="inventory.busy.value"
              @fill="applyFill"
              @close="containerOpen = false"
            />
          </ProfilePane>

          <ProfilePane v-else-if="openWeaponItem" :title="openWeaponItem.name" dense>
            <template #actions>
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                :aria-label="t('common.close')"
                @click="weaponOpen = false"
              />
            </template>
            <WeaponPanel
              :weapon="openWeaponItem"
              :attachments="attachmentCandidates"
              :busy="inventory.busy.value"
              @install="installModule"
              @close="weaponOpen = false"
            />
          </ProfilePane>

          <ProfilePane v-else :title="t('inventory.loadout')" dense>
            <LoadoutPanel :stats="inventory.stats.value" :names="containerNames" />
          </ProfilePane>
        </div>

        <ProfilePane
          flush
          :title="storageLabel(inventory.inventoryStorage.value, t)"
          :hint="t('inventory.grid')"
        >
          <div class="p-2.5">
            <ItemGrid
              :storage="inventory.inventoryStorage.value"
              :selected-id="selectedId"
              :picked-id="drag.picked.value?.id ?? null"
              :storages="inventory.storages.value"
              :equipment="inventory.equipment.value"
              :busy="inventory.busy.value"
              :details="details"
              :attach-tile="drag.attachTile"
              @select="selectItem"
              @pick="pickItem"
              @menu="itemMenu"
            />
          </div>
          <WeightHud :stats="inventory.stats.value" edge="top" />
        </ProfilePane>
      </div>

      <ProfilePane
        flush
        :title="inventory.selectedStorage.value ? storageLabel(inventory.selectedStorage.value, t) : t('inventory.stash')"
      >
        <template #actions>
          <USelect
            v-if="storageOptions.length"
            v-model="storageId"
            :items="storageOptions"
            size="xs"
            class="w-40"
            :aria-label="t('inventory.stashSelector')"
          />
          <UButton
            v-if="inventory.selectedStorage.value?.kind === 'stash'"
            icon="i-lucide-align-start-vertical"
            size="xs"
            color="neutral"
            variant="ghost"
            :aria-label="t('inventory.autoArrange')"
            :title="t('inventory.autoArrange')"
            :disabled="!inventory.selectedStorage.value?.items.length || inventory.busy.value"
            @click="arrange"
          />
          <UButton
            icon="i-lucide-settings-2"
            size="xs"
            color="neutral"
            variant="ghost"
            :aria-label="t('inventory.manageStashes')"
            :title="t('inventory.manageStashes')"
            @click="storageOpen = true"
          />
        </template>

        <template v-if="inventory.selectedStorage.value">
          <div
            v-if="!inventory.stashes.value.length"
            class="flex items-center justify-between gap-2 px-3 pt-2"
          >
            <p class="text-[11px] text-[var(--sz-text-dim)]">{{ t('inventory.noStash') }}</p>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              :label="t('inventory.createStash')"
              @click="storageOpen = true"
            />
          </div>
          <p
            v-if="inventory.selectedStorage.value.kind === 'overflow'"
            class="px-3 pt-2 text-[11px] text-[var(--sz-text-muted)]"
          >
            {{ t('inventory.overflowHint') }}
          </p>
          <WeightHud :storage="inventory.selectedStorage.value" />
          <div class="p-2.5">
            <ItemGrid
              :storage="inventory.selectedStorage.value"
              :selected-id="selectedId"
              :picked-id="drag.picked.value?.id ?? null"
              :storages="inventory.storages.value"
              :equipment="inventory.equipment.value"
              :busy="inventory.busy.value"
              :details="details"
              :drop-enabled="inventory.selectedStorage.value.kind !== 'overflow'"
              :empty-text="
                inventory.selectedStorage.value.kind === 'overflow' ? t('inventory.overflowEmpty') : undefined
              "
              :attach-tile="drag.attachTile"
              @select="selectItem"
              @pick="pickItem"
              @menu="itemMenu"
            />
          </div>
        </template>
        <div v-else class="space-y-2 p-3">
          <p class="text-[12px] text-[var(--sz-text-dim)]">{{ t('inventory.noStash') }}</p>
          <UButton
            size="xs"
            icon="i-lucide-plus"
            :label="t('inventory.createStash')"
            @click="storageOpen = true"
          />
        </div>
      </ProfilePane>
    </template>

    <UModal v-model:open="detailsOpen" :title="t('inventory.itemDetails')">
      <template #body>
        <ItemDetailsPanel
          v-if="selectedItem"
          :item="selectedItem"
          :busy="inventory.busy.value"
          @update="updateSelected"
          @remove="removeSelected"
          @open-container="openContainer(selectedItem.id)"
          @open-weapon="openWeapon(selectedItem.id)"
        />
      </template>
    </UModal>

    <ConfirmActionModal
      :open="removal !== null"
      :title="t('inventory.removeItemTitle')"
      :description="t('inventory.removeItemDesc', { name: removal?.name ?? '' })"
      :loading="inventory.busy.value"
      @update:open="(value: boolean) => !value && (removal = null)"
      @confirm="confirmRemoval"
    />

    <UModal v-model:open="storageOpen" :title="t('inventory.storageManager')">
      <template #body>
        <StorageManager
          :stashes="inventory.stashes.value"
          :selected-id="inventory.selectedStorage.value?.id ?? null"
          :busy="inventory.busy.value"
          @select="selectStash"
          @create="createStash"
          @update="updateStash"
          @remove="removeStash"
        />
      </template>
    </UModal>

    <UModal
      :open="Boolean(pendingUnverified)"
      :title="t('inventory.unverifiedTitle')"
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
  </section>
</template>
