import type { TidyStorage } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import { logEvent, withTransaction, WriteError, type WriteResult } from '../../../platform/journal/index.js';
import { planTidy, type TidyCandidate } from '../layout/index.js';
import * as repo from '../repo/index.js';
import { itemSize } from './placement.js';
import { placementSnapshot } from './snapshot.js';

/**
 * Explicit tidy-up for one carried grid or stash. Packs every item currently in the
 * storage by the chosen order, keeps an item that cannot be packed at its original
 * cells and reports it as unplaced. One transaction and one audited event.
 */
export function tidyStorage(db: Db, storageId: number, input: TidyStorage): WriteResult {
  const storage = repo.getStorage(db, storageId);
  if (!storage) throw new WriteError(404, 'STORAGE_NOT_FOUND', 'Storage not found');
  if (storage.kind === 'overflow') {
    throw new WriteError(422, 'VALIDATION', 'The intake stash is released by moving items out, not tidied');
  }

  const placements = repo.listStoragePlacements(db, storageId);
  const candidates: TidyCandidate[] = [];
  const originals = new Map<number, repo.PlacementRow>();
  for (const placement of placements) {
    if (placement.x == null || placement.y == null) continue;
    const row = repo.getInventoryItem(db, placement.item_id);
    if (!row) continue;
    originals.set(row.id, placement);
    candidates.push({
      id: row.id,
      kind: row.kind,
      name: row.display_name ?? row.item_name,
      rank: row.item_rank,
      size: itemSize(db, row),
      original: { x: placement.x, y: placement.y },
    });
  }

  const plan = planTidy({ width: storage.width, height: storage.height }, candidates, input.order);
  const packed = new Map(plan.placed.map((entry) => [entry.id, entry]));
  const before = {
    storageId,
    order: input.order,
    placements: [...originals.entries()]
      .sort(([left], [right]) => left - right)
      .map(([itemId, placement]) => ({ itemId, placement: placementSnapshot(placement) })),
  };
  const after = {
    storageId,
    order: input.order,
    placements: [...originals.entries()]
      .sort(([left], [right]) => left - right)
      .map(([itemId, placement]) => {
        const next = packed.get(itemId);
        return {
          itemId,
          placement: next
            ? { location: 'grid', storageId, x: next.x, y: next.y }
            : placementSnapshot(placement),
        };
      }),
    unplaced: [...plan.unplaced].sort((left, right) => left - right),
  };

  const moves = [...packed.values()].filter((entry) => {
    const current = originals.get(entry.id);
    return (
      current != null &&
      (current.x !== entry.x || current.y !== entry.y)
    );
  });
  const human = moves.length
    ? `Tidied "${storage.name}": moved ${moves.length}${
        plan.unplaced.length ? `, ${plan.unplaced.length} left in place` : ''
      }`
    : plan.unplaced.length
      ? `"${storage.name}" is already packed; ${plan.unplaced.length} item(s) do not fit`
      : `"${storage.name}" is already packed`;
  if (input.dryRun || !moves.length) {
    return { dryRun: input.dryRun, diff: { before, after, human } };
  }

  let eventId: number | undefined;
  withTransaction(db, () => {
    // Free every moved origin before writing the new cells: otherwise an item whose new
    // cells belong to another item that has not been written yet trips the unique origin.
    repo.parkPlacements(db, moves.map((entry) => entry.id));
    for (const entry of moves) {
      repo.upsertPlacement(db, {
        itemId: entry.id,
        characterId: storage.character_id,
        location: 'grid',
        storageId,
        x: entry.x,
        y: entry.y,
      });
    }
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'inventory.storage.tidy',
      entity: 'storage',
      entityId: storageId,
      before,
      after,
    });
  });
  return { dryRun: false, diff: { before, after, human }, eventId };
}
