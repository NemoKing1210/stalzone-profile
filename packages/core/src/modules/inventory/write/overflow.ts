import type { Db } from '../../../platform/db/index.js';
import { logEvent, withTransaction, WriteError } from '../../../platform/journal/index.js';
import {
  itemRect,
  packItems,
  resolveSize,
  type PackItem,
  type PackPlacement,
  type Rect,
  type Size,
} from '../layout/index.js';
import * as repo from '../repo/index.js';

export interface OverflowSpot {
  storageId: number;
  x: number;
  y: number;
  rotated: boolean;
}

const OVERFLOW_NAME = 'Intake';
const OVERFLOW_WIDTH = 40;
const OVERFLOW_HEIGHT = 80;

function sizeOf(db: Db, itemId: number): Size {
  const item = repo.getInventoryItem(db, itemId);
  if (!item) return { width: 1, height: 1 };
  const layout = repo.getItemLayout(db, item.item_id);
  return resolveSize(item.kind, item.category, layout ? { width: layout.width, height: layout.height } : null);
}

/** Rects already occupied in intake, excluding the items a caller is about to move. */
function occupiedRects(db: Db, storageId: number, excludeIds: ReadonlySet<number> = new Set()): Rect[] {
  const rects: Rect[] = [];
  for (const placement of repo.listStoragePlacements(db, storageId)) {
    if (placement.x == null || placement.y == null) continue;
    if (excludeIds.has(placement.item_id)) continue;
    rects.push(itemRect(placement.x, placement.y, sizeOf(db, placement.item_id), placement.rotated === 1));
  }
  return rects;
}

function bottomOf(rects: readonly Rect[]): number {
  return rects.reduce((max, rect) => Math.max(max, rect.y + rect.height), 0);
}

function cannotHold(): WriteError {
  return new WriteError(422, 'INVALID_PLACEMENT', 'The intake stash cannot hold this item');
}

/** The intake row every profile has after setup or the 0008 migration. */
function intakeOrThrow(db: Db, characterId: number): repo.StorageRow {
  const storage = repo.getOverflowStorage(db, characterId);
  if (!storage) {
    throw new WriteError(409, 'STORAGE_NOT_FOUND', 'The intake storage is missing');
  }
  return storage;
}

export function ensureOverflowStorage(db: Db, characterId: number): number {
  const existing = repo.getOverflowStorage(db, characterId);
  if (existing) return existing.id;

  let id = 0;
  withTransaction(db, () => {
    id = repo.insertStorage(db, {
      characterId,
      kind: 'overflow',
      name: OVERFLOW_NAME,
      width: OVERFLOW_WIDTH,
      height: OVERFLOW_HEIGHT,
      sortOrder: 0,
    });
    logEvent(db, {
      actor: 'owner',
      action: 'inventory.storage.create',
      entity: 'storage',
      entityId: id,
      before: null,
      after: {
        id,
        characterId,
        kind: 'overflow',
        name: OVERFLOW_NAME,
        width: OVERFLOW_WIDTH,
        height: OVERFLOW_HEIGHT,
        maxWeight: null,
        sortOrder: 0,
      },
    });
  });
  return id;
}

/** Finds a free origin without writing; used by dry runs and by creates. */
export function nextOverflowPlacement(db: Db, characterId: number, size: Size): OverflowSpot {
  const storageId = intakeOrThrow(db, characterId).id;
  const occupied = occupiedRects(db, storageId);
  const height = Math.max(OVERFLOW_HEIGHT, bottomOf(occupied) + Math.max(size.width, size.height));
  const { placed } = packItems({ width: OVERFLOW_WIDTH, height }, [{ id: 0, size }], occupied);
  const spot = placed[0];
  if (!spot) throw cannotHold();
  return { storageId, x: spot.x, y: spot.y, rotated: spot.rotated };
}

/** Packs a batch into intake in one pass; the caller writes the placements. */
export function packIntoOverflow(db: Db, characterId: number, items: readonly PackItem[]): PackPlacement[] {
  const storageId = intakeOrThrow(db, characterId).id;
  const exclude = new Set(items.map((item) => item.id));
  const occupied = occupiedRects(db, storageId, exclude);
  const added = items.reduce((sum, item) => sum + Math.max(item.size.width, item.size.height), 0);
  const height = Math.max(OVERFLOW_HEIGHT, bottomOf(occupied) + added);
  const { placed, unplaced } = packItems({ width: OVERFLOW_WIDTH, height }, items, occupied);
  if (unplaced.length) throw cannotHold();
  return placed;
}

export function placeIntoOverflow(db: Db, characterId: number, itemId: number, size: Size): OverflowSpot {
  ensureOverflowStorage(db, characterId);
  const spot = nextOverflowPlacement(db, characterId, size);
  repo.upsertPlacement(db, {
    itemId,
    characterId,
    location: 'grid',
    storageId: spot.storageId,
    x: spot.x,
    y: spot.y,
    rotated: spot.rotated,
  });
  return spot;
}
