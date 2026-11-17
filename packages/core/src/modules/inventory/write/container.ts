import type { Db } from '../../../platform/db/index.js';
import { logEvent, withTransaction, WriteError, type WriteResult } from '../../../platform/journal/index.js';
import * as repo from '../repo/index.js';
import { placementSnapshot } from './snapshot.js';
import { effectiveContainerSlots } from './placement.js';

export function setContainerFill(
  db: Db,
  containerItemId: number,
  slots: readonly (number | null)[],
  opts: { dryRun: boolean },
): WriteResult {
  const container = repo.getInventoryItem(db, containerItemId);
  if (!container) throw new WriteError(404, 'ITEM_NOT_FOUND', 'Container not found');
  if (container.kind !== 'container') {
    throw new WriteError(422, 'NOT_A_CONTAINER', 'The target item is not a container');
  }

  const capacity = effectiveContainerSlots(db, container);
  if (capacity == null) {
    throw new WriteError(422, 'VALIDATION', 'The container has no artifact slot data');
  }
  if (slots.length > capacity) {
    throw new WriteError(409, 'CONTAINER_FULL', `The container has ${capacity} slot(s)`, { slots: capacity });
  }

  const seen = new Set<number>();
  for (const itemId of slots) {
    if (itemId == null) continue;
    if (seen.has(itemId)) {
      throw new WriteError(422, 'VALIDATION', 'An artifact is listed twice in the fill');
    }
    seen.add(itemId);
    const artifact = repo.getInventoryItem(db, itemId);
    if (!artifact || artifact.character_id !== container.character_id) {
      throw new WriteError(404, 'ITEM_NOT_FOUND', 'Artifact not found');
    }
    if (artifact.kind !== 'artifact') {
      throw new WriteError(422, 'NOT_AN_ARTIFACT', 'Only an artifact can fill a container slot');
    }
  }

  const current = repo
    .listPlacements(db, container.character_id)
    .filter(
      (placement) => placement.location === 'container' && placement.container_item_id === containerItemId,
    )
    .sort((a, b) => (a.container_slot ?? 0) - (b.container_slot ?? 0));
  const previouslyInstalled = new Set(current.map((placement) => placement.item_id));
  const movedToLoose = [...previouslyInstalled].filter((itemId) => !seen.has(itemId));
  /** Wanted artifacts that were outside this container; their old spot is restored on rollback. */
  const incoming = [...seen]
    .filter((itemId) => !previouslyInstalled.has(itemId))
    .map((itemId) => {
      const placement = repo.getPlacement(db, itemId);
      return { itemId, placement: placement ? placementSnapshot(placement) : { location: 'loose' } };
    });

  const before = {
    containerItemId,
    capacity,
    slots: current.map((placement) => ({ slot: placement.container_slot, itemId: placement.item_id })),
    incoming,
  };
  const after = {
    containerItemId,
    capacity,
    slots: slots.map((itemId, index) => ({ slot: index, itemId: itemId ?? null })),
    movedToLoose,
  };
  const human = `Filled "${container.display_name ?? container.item_name}" with ${seen.size} artifact(s)${
    movedToLoose.length ? `, moved ${movedToLoose.length} to loose` : ''
  }`;
  if (opts.dryRun) return { dryRun: true, diff: { before, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    // Free every occupied slot first: a retained artifact may move to another slot,
    // and the unique (container, slot) index would reject an in-place reorder.
    for (const placement of current) {
      repo.upsertPlacement(db, {
        itemId: placement.item_id,
        characterId: container.character_id,
        location: 'loose',
      });
    }
    slots.forEach((itemId, index) => {
      if (itemId == null) return;
      repo.upsertPlacement(db, {
        itemId,
        characterId: container.character_id,
        location: 'container',
        containerItemId,
        containerSlot: index,
      });
    });
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'inventory.container.fill',
      entity: 'inventory',
      entityId: containerItemId,
      before,
      after,
    });
  });

  return { dryRun: false, diff: { before, after, human }, eventId };
}
