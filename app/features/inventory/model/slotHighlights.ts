import {
  acceptsEquipment,
  EquipmentSlotSchema,
  type EquipmentSlot,
  type InventoryItemRead,
} from '@profile/shared/contracts';

/** Every equipment slot in draw order; the schema is the source of truth. */
export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = EquipmentSlotSchema.options;

/**
 * Slots a dragged item can land in, derived from the same compatibility table the
 * drop validator and the write service use. No second slot list can drift from it.
 */
export function highlightedSlots(item: InventoryItemRead | null): EquipmentSlot[] {
  if (!item) return [];
  return EQUIPMENT_SLOTS.filter((slot) => acceptsEquipment(slot, item));
}
