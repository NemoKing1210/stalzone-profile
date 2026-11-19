import type { Db } from '../../../platform/db/index.js';
import { logEvent, withTransaction, WriteError, type WriteResult } from '../../../platform/journal/index.js';
import { itemRect, packItems, type Rect } from '../layout/index.js';
import * as repo from '../repo/index.js';
import { itemSize } from './placement.js';
import { placementSnapshot } from './snapshot.js';

/** Packs the intake items into a regular stash; intake itself cannot be a target. */
export function autoArrangeStorage(db: Db, storageId: number, opts: { dryRun: boolean }): WriteResult {
  const storage = repo.getStorage(db, storageId);
  if (!storage) throw new WriteError(404, 'STORAGE_NOT_FOUND', 'Storage not found');
  if (storage.kind !== 'stash') {
    throw new WriteError(422, 'VALIDATION', 'Intake items can only be packed into a regular stash');
  }

  const occupied: Rect[] = [];
  for (const placement of repo.listStoragePlacements(db, storageId)) {
    if (placement.x == null || placement.y == null) continue;
    const row = repo.getInventoryItem(db, placement.item_id);
    if (!row) continue;
    occupied.push(itemRect(placement.x, placement.y, itemSize(db, row), placement.rotated === 1));
  }

  const intake = repo.getOverflowStorage(db, storage.character_id);
  const sources = intake
    ? repo
        .listStoragePlacements(db, intake.id)
        .map((placement) => ({ placement, row: repo.getInventoryItem(db, placement.item_id) }))
        .filter((entry): entry is { placement: repo.PlacementRow; row: repo.InventoryItemJoined } =>
          entry.row !== null,
        )
    : [];

  const { placed, unplaced } = packItems(
    { width: storage.width, height: storage.height },
    sources.map((entry) => ({ id: entry.row.id, size: itemSize(db, entry.row) })),
    occupied,
  );

  const before = {
    storageId,
    sources: sources.map((entry) => ({
      itemId: entry.row.id,
      placement: placementSnapshot(entry.placement),
    })),
  };
  const after = { storageId, placed, unplaced };
  const human = placed.length
    ? `Packed ${placed.length} item(s) from the intake stash into "${storage.name}"${
        unplaced.length ? `, ${unplaced.length} left in intake` : ''
      }`
    : 'No intake items fit';
  if (opts.dryRun || !placed.length) return { dryRun: opts.dryRun, diff: { before, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    for (const entry of placed) {
      repo.upsertPlacement(db, {
        itemId: entry.id,
        characterId: storage.character_id,
        location: 'grid',
        storageId,
        x: entry.x,
        y: entry.y,
        rotated: entry.rotated,
      });
    }
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'inventory.autoArrange',
      entity: 'storage',
      entityId: storageId,
      before,
      after,
    });
  });
  return { dryRun: false, diff: { before, after, human }, eventId };
}
