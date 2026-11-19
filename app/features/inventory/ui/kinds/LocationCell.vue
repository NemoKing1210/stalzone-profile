<script setup lang="ts">
import type { StorageKind } from '@profile/shared/contracts';

import { storageLabel } from '../../model/labels';

const props = defineProps<{
  row: {
    location: string | null;
    storageName: string | null;
    storageKind: StorageKind | null;
    parentName: string | null;
    equipmentSlot: string | null;
    moduleSlot: string | null;
    slotIndex: number | null;
  };
}>();

const { t } = useI18n();

const EQUIPMENT_SLOTS = new Set([
  'primary',
  'secondary',
  'melee',
  'armor',
  'backpack',
  'container',
  'quick1',
  'quick2',
  'quick3',
  'quick4',
]);
const MODULE_SLOTS = new Set(['scope', 'muzzle', 'grip', 'magazine', 'stock', 'tactical', 'other']);

const label = computed(() => {
  const row = props.row;
  if (row.location === 'grid') {
    return row.storageKind
      ? storageLabel({ kind: row.storageKind, name: row.storageName ?? '' }, t)
      : (row.storageName ?? t('inventory.inGrid'));
  }
  if (row.location === 'equipment') {
    return row.equipmentSlot && EQUIPMENT_SLOTS.has(row.equipmentSlot)
      ? t(`inventory.slots.${row.equipmentSlot}`)
      : t('inventory.equipment');
  }
  if (row.location === 'container') {
    const slot = row.slotIndex == null ? '' : ` · ${row.slotIndex + 1}`;
    return `${row.parentName ?? t('inventory.inContainer')}${slot}`;
  }
  if (row.location === 'weapon_module') {
    const slot =
      row.moduleSlot && MODULE_SLOTS.has(row.moduleSlot) ? ` · ${t(`inventory.module.${row.moduleSlot}`)}` : '';
    return `${row.parentName ?? t('inventory.weaponModules')}${slot}`;
  }
  if (row.location === 'loose') return t('inventory.loose');
  return '—';
});
</script>

<template>
  <span class="text-[12px] text-[var(--sz-text-muted)]" :title="label">{{ label }}</span>
</template>
