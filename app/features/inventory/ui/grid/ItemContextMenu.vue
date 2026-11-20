<script setup lang="ts">
import type { EquipmentRead, InventoryItemRead, StorageRead } from '@profile/shared/contracts';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from 'reka-ui';

import { storageLabel } from '../../model/labels';
import { equipTarget, moveDestinations, type ItemMenuAction, type MenuDestination } from '../../model/menu';

const props = withDefaults(
  defineProps<{
    /** `null` on an empty equipment slot: the trigger stays inert. */
    item: InventoryItemRead | null;
    /** Read for the "Move to" submenu; only the writable storages are offered. */
    storages?: StorageRead[];
    /** Read for the "Equip" action: an empty compatible slot wins over a swap. */
    equipment?: EquipmentRead | null;
    busy?: boolean;
  }>(),
  { storages: () => [], equipment: null, busy: false },
);

const emit = defineEmits<{ action: [action: ItemMenuAction] }>();

const { t } = useI18n();
const { rankTextColor } = useFormat();

const open = ref(false);
const name = computed(() => props.item?.displayName ?? props.item?.name ?? '');
const nameColor = computed(() => rankTextColor(props.item?.rank));
const subtitle = computed(() =>
  [
    props.item?.category ?? props.item?.kind,
    (props.item?.level ?? 0) > 0 ? `+${props.item?.level}` : null,
    (props.item?.qty ?? 1) > 1 ? `×${props.item?.qty}` : null,
  ]
    .filter(Boolean)
    .join(' · '),
);

/** Built when the menu opens: a closed menu costs no grid scans. */
const destinations = computed<MenuDestination[]>(() =>
  open.value && props.item ? moveDestinations(props.item, props.storages) : [],
);

const equip = computed(() => (open.value && props.item ? equipTarget(props.item, props.equipment) : null));

const itemClass =
  'relative flex cursor-default select-none items-center gap-2 px-2 py-1.5 text-[12px] leading-tight outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-[var(--sz-surface-header)]';

function storageIcon(storage: StorageRead): string {
  return storage.kind === 'inventory' ? 'i-lucide-backpack' : 'i-lucide-archive';
}

function run(action: ItemMenuAction): void {
  emit('action', action);
}

function moveTo(entry: MenuDestination): void {
  if (!entry.spot) return;
  run({ kind: 'move', target: { location: 'grid', storageId: entry.storage.id, ...entry.spot } });
}
</script>

<template>
  <ContextMenuRoot v-model:open="open">
    <ContextMenuTrigger as-child :disabled="!item">
      <span class="contents"><slot /></span>
    </ContextMenuTrigger>

    <ContextMenuPortal>
      <ContextMenuContent
        v-if="item"
        class="z-50 min-w-[13rem] max-w-[18rem] border border-[var(--sz-border-strong)] bg-[var(--sz-surface)] p-1 text-[var(--sz-text)] outline-none"
        :collision-padding="8"
      >
        <ContextMenuLabel class="mb-1 block border-b border-[var(--sz-border)] px-2 pb-1.5 pt-0.5">
          <span class="block truncate text-[12.5px] font-medium" :style="{ color: nameColor }">{{ name }}</span>
          <span class="block truncate text-[10.5px] text-[var(--sz-text-muted)]">{{ subtitle }}</span>
        </ContextMenuLabel>

        <ContextMenuItem :class="itemClass" @select="run({ kind: 'details' })">
          <UIcon name="i-lucide-scan-eye" class="size-3.5 shrink-0 text-[var(--sz-text-muted)]" aria-hidden="true" />
          <span class="flex-1">{{ t('inventory.menu.details') }}</span>
        </ContextMenuItem>

        <ContextMenuItem
          v-if="item?.kind === 'container'"
          :class="itemClass"
          @select="run({ kind: 'container' })"
        >
          <UIcon name="i-lucide-box" class="size-3.5 shrink-0 text-[var(--sz-text-muted)]" aria-hidden="true" />
          <span class="flex-1">{{ t('inventory.containerFill') }}</span>
        </ContextMenuItem>

        <ContextMenuItem v-if="item?.kind === 'weapon'" :class="itemClass" @select="run({ kind: 'weapon' })">
          <UIcon name="i-lucide-paperclip" class="size-3.5 shrink-0 text-[var(--sz-text-muted)]" aria-hidden="true" />
          <span class="flex-1">{{ t('inventory.weaponModules') }}</span>
        </ContextMenuItem>

        <ContextMenuSeparator class="my-1 h-px bg-[var(--sz-border)]" />

        <ContextMenuItem
          v-if="equip"
          :class="itemClass"
          :disabled="busy"
          @select="run({ kind: 'move', target: { location: 'equipment', slot: equip.slot } })"
        >
          <UIcon
            name="i-lucide-arrow-up-to-line"
            class="size-3.5 shrink-0 text-[var(--sz-text-muted)]"
            aria-hidden="true"
          />
          <span class="flex-1">{{ t('inventory.menu.equip') }}</span>
          <span class="shrink-0 text-[10.5px] text-[var(--sz-text-muted)]">{{ t(`inventory.slots.${equip.slot}`) }}</span>
        </ContextMenuItem>

        <ContextMenuSub>
          <ContextMenuSubTrigger
            :class="[itemClass, 'data-[state=open]:bg-[var(--sz-surface-header)]']"
            :disabled="busy"
          >
            <UIcon
              name="i-lucide-folder-input"
              class="size-3.5 shrink-0 text-[var(--sz-text-muted)]"
              aria-hidden="true"
            />
            <span class="flex-1">{{ t('inventory.menu.moveTo') }}</span>
            <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 text-[var(--sz-text-dim)]" aria-hidden="true" />
          </ContextMenuSubTrigger>
          <ContextMenuPortal>
            <ContextMenuSubContent
              class="z-50 max-h-72 min-w-[13rem] max-w-[18rem] overflow-y-auto border border-[var(--sz-border-strong)] bg-[var(--sz-surface)] p-1 text-[var(--sz-text)] outline-none"
              :collision-padding="8"
            >
              <p v-if="!destinations.length" class="px-2 py-1.5 text-[11px] text-[var(--sz-text-muted)]">
                {{ t('inventory.menu.noStorage') }}
              </p>
              <ContextMenuItem
                v-for="entry in destinations"
                :key="entry.storage.id"
                :class="itemClass"
                :disabled="!entry.spot"
                @select="moveTo(entry)"
              >
                <UIcon
                  :name="storageIcon(entry.storage)"
                  class="size-3.5 shrink-0 text-[var(--sz-text-muted)]"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1 truncate">{{ storageLabel(entry.storage, t) }}</span>
                <span v-if="!entry.spot" class="shrink-0 text-[10.5px] text-[var(--sz-warning-text)]">
                  {{ t('inventory.menu.noRoom') }}
                </span>
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuPortal>
        </ContextMenuSub>

        <ContextMenuSeparator class="my-1 h-px bg-[var(--sz-border)]" />

        <ContextMenuItem
          :class="[itemClass, 'text-[var(--sz-danger-text)] data-[highlighted]:bg-[var(--sz-danger)]/10']"
          :disabled="busy"
          @select="run({ kind: 'remove' })"
        >
          <UIcon name="i-lucide-trash-2" class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="flex-1">{{ t('common.delete') }}</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>
