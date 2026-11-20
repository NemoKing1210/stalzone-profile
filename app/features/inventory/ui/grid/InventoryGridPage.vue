<script setup lang="ts">
import type { InventoryItemRead, ModuleSlot, StorageRead } from '@profile/shared/contracts';

import { findDetailsCard } from '~/entities/item';
import { ConfirmActionModal, ProfilePane } from '~/shared/ui';
import type { DropTarget } from '../../model/drag';
import { storageLabel } from '../../model/labels';
import type { ItemMenuAction } from '../../model/menu';
import { useFilters } from '../../model/useFilters';
import { useContainerFilters } from '../../model/useContainerFilters';
import type { ContainerFilter } from '../../model/containerFilters';
import { stashTabs } from '../../model/stashTabs';
import { MODAL_WIDTH } from '~/shared/lib/modalWidth';
import { useProfileData } from '~/stores/profile-data';
import { useInventory } from '../../model/useInventory';
import WeightHud from './WeightHud.vue';
import DragPreview from './DragPreview.vue';
import EquipmentDoll from './EquipmentDoll.vue';
import ItemDetailsModal from '../ItemDetailsModal.vue';
import ItemGrid from './ItemGrid.vue';
import LoadoutPanel from './LoadoutPanel.vue';
import StorageManager from './StorageManager.vue';
import ContainerFilterBar from './ContainerFilterBar.vue';
import { nextPane, resolvePane, type LeftPane } from '../../model/panes';
import { provideGridDrag } from './drag-context';
import { useGridDrag } from './useGridDrag';

const { t } = useI18n();
const toast = useToast();
useHead(() => ({ title: `${t('inventory.title')} // ${t('common.appName')}` }));

const inventory = useInventory();
const containerFilters = useContainerFilters();
const tidyOrder = useFilters<{ order: 'kind' | 'name' | 'rank' | 'footprint' }>('inventory-tidy-order', {
  order: 'kind',
});
const { place: playPlace } = useUiSounds();
/** Catalog cards behind the instances: the tiles read type and caliber from them. */
const { payload } = useProfileData();
const details = computed(() => payload.value?.details ?? null);

/* ------------------------------------------------------------------ */
/* Drag state shared by both grids, the paper-doll and the panels      */
/* ------------------------------------------------------------------ */

const drag = useGridDrag({
  onDrop: (itemId, target) => dropItem(itemId, target),
  storageFor: (storageId) => inventory.storages.value.find((entry) => entry.id === storageId) ?? null,
  onDropRejected: (reason) =>
    toast.add({
      title: t(reason === 'filtered' ? 'inventory.filter.dropBlocked' : 'inventory.dropBlocked'),
      color: 'warning',
      icon: 'i-lucide-ban',
    }),
  homeStorageId: () => inventory.inventoryStorage.value?.id ?? null,
  intakeStorageId: () => inventory.overflow.value?.id ?? null,
  filteredStorageIds: containerFilters.activeStorages,
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
}

/** The details panel opens on a double click; a single click only selects the card. */
function openItem(item: InventoryItemRead): void {
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
    case 'container':
    case 'weapon':
      openItem(item);
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
const storageOpen = ref(false);
/** The header toggle: the left column shows the worn equipment or the selected stash. */
const leftState = useFilters('inventory-left-pane', { pane: 'equipment' });
const leftPane = computed<LeftPane>(() => resolvePane(leftState.pane));

function setLeftPane(pane: LeftPane): void {
  leftState.pane = pane;
}

// The command palette opens a stash by URL; an invalid id leaves the current selection alone.
onMounted(() => {
  const id = Number(useRoute().query.stash);
  if (Number.isInteger(id) && id > 0) {
    setLeftPane('stash');
    inventory.selectStorage(id);
  }
});

function toggleLeftPane(): void {
  setLeftPane(nextPane(leftPane.value));
}
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
const CARD_PREFIX: Record<string, string> = { weapon: 'w', armor: 'a', artifact: 'art', container: 'c' };
const selectedCard = computed(() =>
  selectedItem.value ? findDetailsCard(details.value, CARD_PREFIX[selectedItem.value.kind] ?? '', selectedItem.value.name) : null,
);

const artifactCandidates = computed(() => allItems.value.filter((item) => item.kind === 'artifact'));
const attachmentCandidates = computed(() => allItems.value.filter((item) => item.kind === 'attachment'));

watch(selectedItem, (item) => {
  if (!item) detailsOpen.value = false;
});

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
  const container = selectedItem.value;
  if (container?.kind !== 'container') return;
  await inventory.setContainerFill(container.id, slots);
}

const stashPaneTitle = computed(() =>
  inventory.selectedStorage.value ? storageLabel(inventory.selectedStorage.value, t) : t('inventory.stash'),
);

const pendingUnverified = ref<{ weaponId: number; slot: ModuleSlot; attachmentItemId: number } | null>(null);

async function installModule(slot: ModuleSlot, attachmentItemId: number | null): Promise<void> {
  const weapon = selectedItem.value;
  if (weapon?.kind !== 'weapon') return;
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

const tabs = computed(() =>
  stashTabs(inventory.stashes.value, inventory.overflow.value, inventory.selectedStorage.value?.id ?? null),
);

async function createStash(input: { name: string }): Promise<void> {
  await inventory.createStorage(input);
}

async function updateStash(id: number, patch: { name?: string; maxWeight?: number | null }): Promise<void> {
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

const TIDY_ORDERS = ['kind', 'name', 'rank', 'footprint'] as const;
const tidyItems = computed(() =>
  TIDY_ORDERS.map((order) => ({ label: t(`inventory.tidyOrders.${order}`), value: order })),
);

/** Explicit tidy-up: one audited write; a filter change never triggers it. */
async function tidy(storage: StorageRead | null): Promise<void> {
  if (!storage || storage.kind === 'overflow' || !storage.items.length) return;
  const result = await inventory.tidy(storage.id, tidyOrder.order);
  if (!result) return;
  const after = result.diff.after as { unplaced?: number[] } | null;
  const unplaced = after?.unplaced?.length ?? 0;
  if (unplaced) {
    toast.add({
      title: t('inventory.tidyOverflowTitle'),
      description: t('inventory.tidyOverflow', { count: unplaced }),
      color: 'warning',
      icon: 'i-lucide-triangle-alert',
    });
    return;
  }
  toast.add({
    title: t('inventory.tidyDoneTitle'),
    description: result.diff.human,
    color: 'success',
    icon: 'i-lucide-check',
  });
}

function setFilter(storageId: number, next: ContainerFilter): void {
  Object.assign(containerFilters.filterFor(storageId), next);
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
      </div>
      <div class="flex flex-wrap items-center gap-1" role="group" :aria-label="t('inventory.equipment')">
        <UButton
          size="xs"
          :color="leftPane === 'equipment' ? 'primary' : 'neutral'"
          :variant="leftPane === 'equipment' ? 'solid' : 'outline'"
          :aria-pressed="leftPane === 'equipment'"
          @click="toggleLeftPane"
        >
          {{ t('inventory.equipment') }}
        </UButton>
        <UButton
          size="xs"
          :color="leftPane === 'stash' ? 'primary' : 'neutral'"
          :variant="leftPane === 'stash' ? 'solid' : 'outline'"
          :aria-pressed="leftPane === 'stash'"
          @click="leftPane === 'equipment' ? setLeftPane('stash') : toggleLeftPane()"
        >
          {{ t('inventory.stash') }}
        </UButton>
      </div>
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
      <div class="grid items-stretch gap-3 xl:grid-cols-2">
        <ProfilePane
          class="h-[calc(100vh-9rem)] min-h-[460px] min-w-0"
          flush
          :title="leftPane === 'equipment' ? t('inventory.equipment') : stashPaneTitle"
        >
          <template v-if="leftPane === 'stash'" #header>
            <div
              v-if="tabs.length"
              role="tablist"
              :aria-label="t('inventory.stashSelector')"
              class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap"
            >
              <button
                v-for="tab in tabs"
                :key="tab.storage.id"
                type="button"
                role="tab"
                class="inline-flex min-h-7 shrink-0 items-center gap-1.5 border px-2 text-[11.5px] leading-none transition-colors"
                :class="
                  tab.active
                    ? 'border-[var(--sz-accent)] bg-[var(--sz-accent)] text-[var(--sz-on-accent)]'
                    : 'border-[var(--sz-border)] bg-ink-800 text-[var(--sz-text-muted)] hover:bg-ink-700 hover:text-[var(--sz-text)]'
                "
                :aria-selected="tab.active"
                :aria-current="tab.active ? 'page' : undefined"
                @click="selectStash(tab.storage.id)"
              >
                <span class="truncate">{{ storageLabel(tab.storage, t) }}</span>
                <span
                  class="tabular-nums text-[10px]"
                  :class="tab.active ? 'text-[var(--sz-on-accent)]/80' : 'text-[var(--sz-text-dim)]'"
                >
                  {{ tab.storage.items.length }}
                </span>
              </button>
            </div>
            <h2 v-else class="sz-caps min-w-0 truncate text-[var(--sz-text-muted)]">{{ stashPaneTitle }}</h2>
          </template>
          <template v-if="leftPane === 'stash'" #actions>
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

          <div class="h-full overflow-auto">
            <div class="p-2">
            <template v-if="leftPane === 'equipment'">
              <EquipmentDoll
                :equipment="inventory.equipment.value"
                :storages="inventory.storages.value"
                :busy="inventory.busy.value"
                :attach-tile="drag.attachTile"
                @select="selectItem"
                @open="openItem"
                @pick="pickItem"
                @menu="itemMenu"
              />
              <div class="mt-3">
                <LoadoutPanel :stats="inventory.stats.value" :names="containerNames" />
              </div>
            </template>

            <template v-else-if="inventory.selectedStorage.value">
              <div
                v-if="!inventory.stashes.value.length"
                class="mb-2 flex flex-wrap items-center justify-between gap-2"
              >
                <p class="text-[11px] text-[var(--sz-text-dim)]">{{ t('inventory.noStash') }}</p>
                <UButton size="xs" icon="i-lucide-plus" :label="t('inventory.createStash')" @click="storageOpen = true" />
              </div>
              <p
                v-if="inventory.selectedStorage.value.kind === 'overflow'"
                class="mb-2 text-[11px] text-[var(--sz-text-muted)]"
              >
                {{ t('inventory.overflowHint') }}
              </p>
              <div class="mb-2 mt-2 flex flex-wrap items-center gap-1.5 border-b border-[var(--sz-border)] pb-2">
                <ContainerFilterBar
                  :filter="containerFilters.filterFor(inventory.selectedStorage.value.id)"
                  :items="inventory.selectedStorage.value.items"
                  @update="(next) => setFilter(inventory.selectedStorage.value!.id, next)"
                />
                <div
                  v-if="inventory.selectedStorage.value.kind !== 'overflow'"
                  class="ml-auto flex items-center gap-1"
                >
                  <USelect
                    v-model="tidyOrder.order"
                    :items="tidyItems"
                    size="xs"
                    class="w-32"
                    :aria-label="t('inventory.tidyOrder')"
                  />
                  <UButton
                    icon="i-lucide-list-restart"
                    size="xs"
                    color="neutral"
                    variant="outline"
                    :label="t('inventory.tidy')"
                    :loading="inventory.busy.value"
                    :disabled="!inventory.selectedStorage.value.items.length || inventory.busy.value"
                    @click="tidy(inventory.selectedStorage.value)"
                  />
                </div>
              </div>
              <div class="mt-2">
                <ItemGrid
                  :storage="inventory.selectedStorage.value"
                  :filter="containerFilters.filterFor(inventory.selectedStorage.value.id)"
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
                  @open="openItem"
                  @pick="pickItem"
                  @menu="itemMenu"
                />
              </div>
            </template>

            <div v-else class="space-y-2">
              <p class="text-[12px] text-[var(--sz-text-dim)]">{{ t('inventory.noStash') }}</p>
              <UButton size="xs" icon="i-lucide-plus" :label="t('inventory.createStash')" @click="storageOpen = true" />
            </div>
            </div>
          </div>

          <template v-if="leftPane === 'stash'" #footer>
            <WeightHud v-if="inventory.selectedStorage.value" :storage="inventory.selectedStorage.value" />
          </template>
        </ProfilePane>

        <ProfilePane
          class="h-[calc(100vh-9rem)] min-h-[460px] min-w-0"
          flush
          :title="storageLabel(inventory.inventoryStorage.value, t)"
        >
          <div class="h-full overflow-auto">
            <div class="p-2.5">
            <div class="mb-2 flex flex-wrap items-center gap-1.5 border-b border-[var(--sz-border)] pb-2">
              <ContainerFilterBar
                :filter="containerFilters.filterFor(inventory.inventoryStorage.value.id)"
                :items="inventory.inventoryStorage.value.items"
                @update="(next) => setFilter(inventory.inventoryStorage.value!.id, next)"
              />
              <div class="ml-auto flex items-center gap-1">
                <USelect
                  v-model="tidyOrder.order"
                  :items="tidyItems"
                  size="xs"
                  class="w-32"
                  :aria-label="t('inventory.tidyOrder')"
                />
                <UButton
                  icon="i-lucide-list-restart"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  :label="t('inventory.tidy')"
                  :loading="inventory.busy.value"
                  :disabled="!inventory.inventoryStorage.value.items.length || inventory.busy.value"
                  @click="tidy(inventory.inventoryStorage.value)"
                />
              </div>
            </div>
            <ItemGrid
              :storage="inventory.inventoryStorage.value"
              :filter="containerFilters.filterFor(inventory.inventoryStorage.value.id)"
              :selected-id="selectedId"
              :picked-id="drag.picked.value?.id ?? null"
              :storages="inventory.storages.value"
              :equipment="inventory.equipment.value"
              :busy="inventory.busy.value"
              :details="details"
              :attach-tile="drag.attachTile"
              @select="selectItem"
              @open="openItem"
              @pick="pickItem"
              @menu="itemMenu"
            />
            </div>
          </div>
          <template #footer>
            <WeightHud :stats="inventory.stats.value" />
          </template>
        </ProfilePane>
      </div>
    </template>

    <ItemDetailsModal
      v-model:open="detailsOpen"
      :kind="selectedItem?.kind ?? 'other'"
      :name="selectedItem?.displayName ?? selectedItem?.name ?? ''"
      :item="selectedItem"
      :card="selectedCard"
      :attachments="attachmentCandidates"
      :artifacts="artifactCandidates"
      :busy="inventory.busy.value"
      @update="updateSelected"
      @remove="removeSelected"
      @install="installModule"
      @fill="applyFill"
    />

    <ConfirmActionModal
      :open="removal !== null"
      :title="t('inventory.removeItemTitle')"
      :description="t('inventory.removeItemDesc', { name: removal?.name ?? '' })"
      :loading="inventory.busy.value"
      @update:open="(value: boolean) => !value && (removal = null)"
      @confirm="confirmRemoval"
    />

    <UModal
      v-model:open="storageOpen"
      :title="t('inventory.storageManager')"
      :ui="{ content: MODAL_WIDTH.form }"
    >
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
  </section>
</template>
