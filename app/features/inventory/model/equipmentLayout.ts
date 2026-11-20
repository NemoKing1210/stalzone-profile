import type { EquipmentRead, EquipmentSlot, InventoryItemRead } from '@profile/shared/contracts';

import type { Size } from './grid';

/** The equipment doll draws on a fixed cell grid, so its rows and columns stay square. */
export const EQUIPMENT_GRID = { columns: 10, rows: 10 } as const;

export interface EquipmentCell extends Size {
  slot: EquipmentSlot;
  x: number;
  y: number;
}

const WEAPON_SLOTS: readonly EquipmentSlot[] = ['primary', 'secondary', 'melee'];
const BOX_SLOTS: readonly EquipmentSlot[] = ['armor', 'backpack', 'container'];
const QUICK_SLOTS: readonly EquipmentSlot[] = ['quick1', 'quick2', 'quick3', 'quick4'];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * The footprint of one equipment slot. Weapons take the size of the held weapon but
 * never shrink below five cells or grow past the two weapon columns; armor and
 * containers are a 3×3 square; a quick slot is one cell.
 */
export function slotFootprint(slot: EquipmentSlot, item: InventoryItemRead | null): Size {
  if (WEAPON_SLOTS.includes(slot)) {
    return { width: clamp(item?.size.width ?? 5, 5, 6), height: 2 };
  }
  if (BOX_SLOTS.includes(slot)) return { width: 3, height: 3 };
  return { width: 1, height: 1 };
}

/**
 * Every slot on the 10×10 doll grid: weapons stack in the left six columns, the three
 * box slots stack in the right three, and the quick row sits underneath both.
 */
export function equipmentLayout(equipment: EquipmentRead | null): EquipmentCell[] {
  const boxes: EquipmentCell[] = [];
  const weaponRows = [0, 2, 4];
  WEAPON_SLOTS.forEach((slot, index) => {
    boxes.push({ slot, x: 0, y: weaponRows[index]!, ...slotFootprint(slot, equipment?.[slot] ?? null) });
  });

  const boxRows = [0, 3, 6];
  BOX_SLOTS.forEach((slot, index) => {
    boxes.push({ slot, x: 7, y: boxRows[index]!, ...slotFootprint(slot, equipment?.[slot] ?? null) });
  });

  QUICK_SLOTS.forEach((slot, index) => {
    boxes.push({ slot, x: index, y: 9, ...slotFootprint(slot, null) });
  });

  return boxes;
}
