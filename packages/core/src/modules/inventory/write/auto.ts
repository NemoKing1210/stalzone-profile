import type { Db } from '../../../platform/db/index.js';
import { logEvent, withTransaction, WriteError, type WriteResult } from '../../../platform/journal/index.js';
import { itemRect, packItems, type Rect } from '../layout/index.js';
import * as repo from '../repo/index.js';
import { itemSize } from './placement.js';

export function autoArrangeStorage(db: Db, storageId: number, opts: { dryRun: boolean }): WriteResult {
  const storage = repo.getStorage(db, storageId);
  if (!storage) throw new WriteError(404, 'STORAGE_NOT_FOUND', 'Storage not found');

  const occupied: Rect[] = [];
  for (const placement of repo.listStoragePlacements(db, storageId)) {
    if (placement.x == null || placement.y == null) continue;
    const row = repo.getInventoryItem(db, placement.item_id);
    if (!row) continue;
    occupied.push(itemRect(placement.x, placement.y, itemSize(db, row), placement.rotated === 1));
  }

  const loose = repo
    .listInventoryItems(db, storage.character_id)
    .filter((row) => {
      const placement = repo.getPlacement(db, row.id);
      return !placement || placement.location === 'loose';
    });

  const { placed, unplaced } = packItems(
    { width: storage.width, height: storage.height },
    loose.map((row) => ({ id: row.id, size: itemSize(db, row) })),
    occupied,
  );

  const before = { storageId, loose: loose.map((row) => row.id) };
  const after = { storageId, placed, unplaced };
  const human = placed.length
    ? `Packed ${placed.length} item(s) into "${storage.name}"${unplaced.length ? `, ${unplaced.length} left loose` : ''}`
    : 'No loose items fit';
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
