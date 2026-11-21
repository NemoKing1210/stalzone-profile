import type { Db } from '../../../platform/db/index.js';
import { resolveSize, resolveWeight } from '../layout/index.js';
import * as repo from '../repo/index.js';

export function placementSnapshot(row: repo.PlacementRow): Record<string, unknown> {
  return {
    location: row.location,
    storageId: row.storage_id,
    x: row.x,
    y: row.y,
    slot: row.equipment_slot,
    containerItemId: row.container_item_id,
    slotIndex: row.container_slot,
    weaponItemId: row.weapon_item_id,
    moduleSlot: row.module_slot,
    verified: row.verified === 1,
  };
}

export function itemContainerSnapshot(db: Db, itemId: number): Record<string, unknown> | null {
  const row = repo.getContainerData(db, itemId);
  if (!row) return null;
  return {
    type: row.type,
    shield: row.shield,
    bonus: row.bonus,
    protection: row.protection,
    slots: row.slots,
    eff: row.eff,
  };
}

export function inventoryItemSnapshot(db: Db, itemId: number): Record<string, unknown> | null {
  const row = repo.getInventoryItem(db, itemId);
  if (!row) return null;
  const placement = repo.getPlacement(db, itemId);
  const layout = repo.getItemLayout(db, row.item_id);
  return {
    id: row.id,
    itemId: row.item_id,
    name: row.display_name ?? row.item_name,
    displayName: row.display_name,
    kind: row.kind,
    category: row.category,
    rank: row.item_rank,
    level: row.level,
    quality: row.quality,
    rarityPct: row.rarity_pct,
    rarityTier: row.rarity_tier,
    skinItemId: row.skin_item_id,
    skinName: row.skin_name,
    qty: row.qty,
    virtual: row.is_virtual === 1,
    slot: row.slot,
    icon: row.item_icon,
    weight: resolveWeight(row.item_weight, layout?.weight ?? null),
    size: resolveSize(row.kind, row.category, layout ? { width: layout.width, height: layout.height } : null),
    placement: placement ? placementSnapshot(placement) : null,
    container: itemContainerSnapshot(db, itemId),
  };
}
