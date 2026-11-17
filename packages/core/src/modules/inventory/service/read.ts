import type { OwnedRead } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import * as repo from '../repo/owned.js';
import type { OwnedContainerRow, OwnedJoined } from '../repo/owned.js';

/** The HTTP view of an owned row: item relation plus its container override, if any. */
export function ownedRead(row: OwnedJoined, container: OwnedContainerRow | null): OwnedRead {
  return {
    id: row.id,
    itemId: row.item_id,
    name: row.display_name ?? row.item_name,
    externalId: row.external_id,
    kind: row.kind,
    category: row.category,
    level: row.level,
    quality: row.quality,
    note: row.note,
    role: row.role,
    slot: row.slot,
    qty: row.qty,
    skinItemId: row.skin_item_id,
    icon: row.item_icon,
    container: container
      ? {
          type: container.container_type,
          shield: container.shield,
          bonus: container.bonus,
          protection: container.protection,
          slots: container.slots,
          eff: container.eff,
        }
      : null,
    updatedAt: row.updated_at,
  };
}

export function listOwnedReads(db: Db, characterId: number, kind?: string): OwnedRead[] {
  return repo.listOwned(db, characterId, kind).map((row) => ownedRead(row, repo.getOwnedContainer(db, row.id)));
}
