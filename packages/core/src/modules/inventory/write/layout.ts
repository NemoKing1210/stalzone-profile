import type { Db } from '../../../platform/db/index.js';
import { logEvent, withTransaction, WriteError, type WriteResult } from '../../../platform/journal/index.js';
import { getItemById } from '../../catalog/index.js';
import { getCharacter } from '../../identity/index.js';
import { findCollision, fits, itemRect, type Rect, type Size } from '../layout/index.js';
import * as repo from '../repo/index.js';
import { itemSize } from './placement.js';

export function setItemLayout(
  db: Db,
  itemId: number,
  input: { width: number; height: number; weight?: number | null },
  opts: { dryRun: boolean },
): WriteResult {
  const item = getItemById(db, itemId);
  if (!item) throw new WriteError(404, 'ITEM_NOT_FOUND', 'Catalog item not found');
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height)) {
    throw new WriteError(422, 'VALIDATION', 'Layout width and height must be whole cells');
  }
  if (input.width < 1 || input.width > 20 || input.height < 1 || input.height > 20) {
    throw new WriteError(422, 'VALIDATION', 'Layout width and height must be between 1 and 20');
  }
  if (input.weight != null && input.weight < 0) {
    throw new WriteError(422, 'VALIDATION', 'Layout weight cannot be negative');
  }

  const nextSize: Size = { width: input.width, height: input.height };
  const conflicts: number[] = [];
  let intake = false;
  const character = getCharacter(db);
  if (character) {
    const instances = repo.listInventoryItems(db, character.id).filter((row) => row.item_id === itemId);
    for (const instance of instances) {
      const placement = repo.getPlacement(db, instance.id);
      if (
        placement?.location !== 'grid' ||
        placement.storage_id == null ||
        placement.x == null ||
        placement.y == null
      ) {
        continue;
      }
      const storage = repo.getStorage(db, placement.storage_id);
      if (!storage) continue;
      if (storage.kind === 'overflow') {
        conflicts.push(instance.id);
        intake = true;
        continue;
      }
      const rect = itemRect(placement.x, placement.y, nextSize);
      if (!fits({ width: storage.width, height: storage.height }, rect)) {
        conflicts.push(instance.id);
        continue;
      }
      const others: Rect[] = [];
      for (const other of repo.listStoragePlacements(db, storage.id)) {
        if (other.item_id === instance.id || other.x == null || other.y == null) continue;
        const row = repo.getInventoryItem(db, other.item_id);
        if (!row) continue;
        const size = row.item_id === itemId ? nextSize : itemSize(db, row);
        others.push(itemRect(other.x, other.y, size));
      }
      if (findCollision(rect, others)) conflicts.push(instance.id);
    }
  }
  if (conflicts.length) {
    throw new WriteError(409, 'LAYOUT_CONFLICT', 'The new size breaks placed items', {
      itemIds: [...new Set(conflicts)],
      reason: intake ? 'intake' : 'size',
    });
  }

  const current = repo.getItemLayout(db, itemId);
  const before = current
    ? { itemId, width: current.width, height: current.height, weight: current.weight }
    : null;
  const after = {
    itemId,
    width: input.width,
    height: input.height,
    weight: input.weight !== undefined ? input.weight : (current?.weight ?? null),
  };
  const human = current
    ? `"${item.name}": ${current.width}×${current.height} → ${input.width}×${input.height}`
    : `"${item.name}": layout ${input.width}×${input.height}`;
  if (opts.dryRun) return { dryRun: true, diff: { before, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    repo.upsertItemLayout(db, itemId, after);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'catalog.itemLayout.update',
      entity: 'item',
      entityId: itemId,
      before,
      after,
    });
  });
  return { dryRun: false, diff: { before, after, human }, eventId };
}
