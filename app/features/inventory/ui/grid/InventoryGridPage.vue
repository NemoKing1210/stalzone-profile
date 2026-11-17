<script setup lang="ts">
import type {
  InventoryItemRead,
  ModuleSlot,
  PlacementTarget,
  StorageRead,
} from '@profile/shared/contracts';

import { ProfilePane } from '~/shared/ui';
import { canDrop, effectiveSize, itemRects, type GridGhostPreview } from '../../model/grid';
import type { DropTarget } from '../../model/drag';
import { useInventory } from '../../model/useInventory';
import ContainerPanel from './ContainerPanel.vue';
import EquipmentDoll from './EquipmentDoll.vue';
import ItemDetailsPanel from './ItemDetailsPanel.vue';
import ItemGrid from './ItemGrid.vue';
import LoadoutPanel from './LoadoutPanel.vue';
import LooseTray from './LooseTray.vue';
import StorageManager from './StorageManager.vue';
import WeaponPanel from './WeaponPanel.vue';
import { useGridDrag } from './useGridDrag';

const { t } = useI18n();
useHead(() => ({ title: `${t('inventory.title')} // ${t('common.appName')}` }));

const inventory = useInventory();

/* ------------------------------------------------------------------ */
/* Drag state shared by both grids, the paper-doll and the panels      */
/* ------------------------------------------------------------------ */

const drag = useGridDrag({
  onDrop: (itemId, target) => dropItem(itemId, target),
  storageAt: (storageId) => {
    const storage = inventory.storages.value.find((entry) => entry.id === storageId);
    return storage ? { width: storage.width, height: storage.height } : null;
  },
  homeStorageId: () => inventory.selectedStorage.value?.id ?? inventory.inventoryStorage.value?.id ?? null,
});

async function dropItem(itemId: number, target: DropTarget): Promise<void> {
  const placement: PlacementTarget =
    target.location === 'loose'
      ? { location: 'loose' }
      : target;
  await inventory.move(itemId, placement);
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

const activeEquipmentSlot = computed(() =>
  drag.target.value?.location === 'equipment' ? drag.target.value.slot : null,
);
const activeContainerSlot = computed(() =>
  drag.target.value?.location === 'container' ? drag.target.value.slot : null,
);
const activeModuleSlot = computed(() =>
  drag.target.value?.location === 'weapon_module' ? drag.target.value.slot : null,
);
const looseActive = computed(() => drag.target.value?.location === 'loose');

/** The dashed preview, valid only inside bounds and clear of every other item. */
function ghostFor(storage: StorageRead): GridGhostPreview | null {
  const picked = drag.picked.value;
  const ghost = drag.ghost.value;
  const target = drag.target.value;
  if (!picked || !ghost || !target || target.location !== 'grid' || ghost.storageId !== storage.id) return null;

  const size = effectiveSize(picked.size, drag.rotated.value);
  const rect = { x: ghost.x, y: ghost.y, ...size };
  const others = itemRects(
    storage.items.flatMap((item) =>
      item.id !== picked.id && item.placement.location === 'grid'
        ? [{ size: item.size, placement: item.placement }]
        : [],
    ),
  );
  return { ...rect, valid: canDrop(rect, { width: storage.width, height: storage.height }, others) };
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

async function moveSelectedLoose(): Promise<void> {
  const item = selectedItem.value;
  if (item) await inventory.move(item.id, { location: 'loose' });
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

const stashItems = computed(() =>
  inventory.stashes.value.map((storage) => ({ label: storage.name, value: storage.id })),
);
const stashId = computed<number | undefined>({
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

async function removeStash(id: number, moveToStorageId: number | null): Promise<void> {
  const result = await inventory.deleteStorage(id, moveToStorageId);
  if (result) inventory.selectStorage(null);
}

function selectStash(id: number): void {
  inventory.selectStorage(id);
}

async function arrange(): Promise<void> {
  const storage = inventory.selectedStorage.value;
  if (storage) await inventory.autoArrange(storage.id);
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
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{{ t('inventory.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('inventory.summary') }}</p>
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
      <div class="grid gap-3 xl:grid-cols-[minmax(250px,300px)_minmax(0,1fr)_minmax(270px,340px)]">
        <div class="space-y-3">
          <ProfilePane :title="t('inventory.equipment')">
            <EquipmentDoll
              :equipment="inventory.equipment.value"
              :active-slot="activeEquipmentSlot"
              @select="selectItem"
              @press="drag.pressItem($event.item, $event.event)"
              @pick="pickItem"
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
              :active-slot="
                drag.target.value?.location === 'container' && drag.target.value.containerItemId === openContainerItem.id
                  ? activeContainerSlot
                  : null
              "
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
              :active-slot="
                drag.target.value?.location === 'weapon_module' && drag.target.value.weaponItemId === openWeaponItem.id
                  ? activeModuleSlot
                  : null
              "
              :busy="inventory.busy.value"
              @install="installModule"
              @close="weaponOpen = false"
            />
          </ProfilePane>

          <ProfilePane v-else :title="t('inventory.loadout')" dense>
            <LoadoutPanel :stats="inventory.stats.value" :names="containerNames" />
          </ProfilePane>
        </div>

        <ProfilePane flush :title="inventory.inventoryStorage.value.name" :hint="t('inventory.grid')">
          <WeightHud :stats="inventory.stats.value" />
          <div class="flex justify-center overflow-auto p-2.5">
            <ItemGrid
              :storage="inventory.inventoryStorage.value"
              :selected-id="selectedId"
              :ghost="ghostFor(inventory.inventoryStorage.value)"
              @select="selectItem"
              @press="drag.pressItem($event.item, $event.event)"
              @pick="pickItem"
            />
          </div>
        </ProfilePane>

        <div class="min-w-0">
          <ProfilePane flush :title="t('inventory.stash')">
            <template #actions>
              <USelect
                v-if="stashItems.length"
                v-model="stashId"
                :items="stashItems"
                size="xs"
                class="w-32"
                :aria-label="t('inventory.stashSelector')"
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
              <WeightHud :stats="inventory.stats.value" :storage="inventory.selectedStorage.value" />
              <div class="flex justify-center overflow-auto p-2.5">
                <ItemGrid
                  :storage="inventory.selectedStorage.value"
                  :selected-id="selectedId"
                  :ghost="ghostFor(inventory.selectedStorage.value)"
                  @select="selectItem"
                  @press="drag.pressItem($event.item, $event.event)"
                  @pick="pickItem"
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
        </div>
      </div>

      <ProfilePane :title="t('inventory.loose')" dense>
        <LooseTray
          :items="inventory.loose.value"
          :target-name="inventory.selectedStorage.value?.name ?? null"
          :busy="inventory.busy.value"
          :active="looseActive"
          @select="selectItem"
          @press="drag.pressItem($event.item, $event.event)"
          @pick="pickItem"
          @arrange="arrange"
        />
      </ProfilePane>
    </template>

    <Teleport to="body">
      <div
        v-if="drag.picked.value && drag.pointer.value"
        class="pointer-events-none fixed z-[100] flex max-w-[140px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 border border-[var(--sz-accent)] bg-ink-950/95 px-2 py-1 text-center shadow-lg"
        :style="{ left: `${drag.pointer.value.x}px`, top: `${drag.pointer.value.y}px` }"
      >
        <img
          v-if="drag.picked.value.icon"
          :src="drag.picked.value.icon"
          :alt="drag.picked.value.name"
          class="max-h-10 max-w-16 object-contain"
        >
        <UIcon v-else name="i-lucide-package" class="size-6 text-[var(--sz-text-dim)]" />
        <span class="line-clamp-2 text-[10px] leading-tight">{{ drag.picked.value.name }}</span>
      </div>
    </Teleport>

    <UModal v-model:open="detailsOpen" :title="t('inventory.itemDetails')">
      <template #body>
        <ItemDetailsPanel
          v-if="selectedItem"
          :item="selectedItem"
          :busy="inventory.busy.value"
          @update="updateSelected"
          @move-loose="moveSelectedLoose"
          @remove="removeSelected"
          @open-container="openContainer(selectedItem.id)"
          @open-weapon="openWeapon(selectedItem.id)"
        />
      </template>
    </UModal>

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
