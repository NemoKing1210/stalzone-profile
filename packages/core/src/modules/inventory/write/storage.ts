import { norm } from '@profile/shared';
import type { StorageCreate, StoragePatch } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import { logEvent, withTransaction, WriteError, type WriteResult } from '../../../platform/journal/index.js';
import { characterOrThrow } from '../../identity/index.js';
import { fits, itemRect, packItems, resolveSize, type Size } from '../layout/index.js';
import * as repo from '../repo/index.js';
import { placementSnapshot } from './snapshot.js';

function storageSnapshot(row: repo.StorageRow): Record<string, unknown> {
  return {
    id: row.id,
    characterId: row.character_id,
    kind: row.kind,
    name: row.name,
    width: row.width,
    height: row.height,
    maxWeight: row.max_weight,
    sortOrder: row.sort_order,
  };
}

function placementSize(db: Db, placement: repo.PlacementRow): Size {
  const item = repo.getInventoryItem(db, placement.item_id);
  if (!item) return { width: 1, height: 1 };
  const layout = repo.getItemLayout(db, item.item_id);
  return resolveSize(item.kind, item.category, layout ? { width: layout.width, height: layout.height } : null);
}

function assertNameFree(
  db: Db,
  characterId: number,
  kind: 'inventory' | 'stash',
  name: string,
  exceptId?: number,
): void {
  const taken = repo
    .listStorages(db, characterId)
    .some((row) => row.kind === kind && row.name_norm === norm(name) && row.id !== exceptId);
  if (taken) throw new WriteError(409, 'STORAGE_NAME_TAKEN', `A storage named "${name}" already exists`);
}

export function ensureInventoryStorage(db: Db, characterId: number): number {
  const existing = repo.getInventoryStorage(db, characterId);
  if (existing) return existing.id;
  return repo.insertStorage(db, {
    characterId,
    kind: 'inventory',
    name: 'Inventory',
    width: 8,
    height: 8,
  });
}

export function createStorage(db: Db, input: StorageCreate): WriteResult {
  const character = characterOrThrow(db);
  if (input.kind === 'inventory') {
    if (repo.getInventoryStorage(db, character.id)) {
      throw new WriteError(409, 'VALIDATION', 'The character already has an inventory storage');
    }
  }
  assertNameFree(db, character.id, input.kind, input.name);

  const after: Record<string, unknown> = {
    id: null,
    characterId: character.id,
    kind: input.kind,
    name: input.name,
    width: input.width,
    height: input.height,
    maxWeight: input.maxWeight ?? null,
    sortOrder: input.sortOrder ?? 0,
  };
  const human = `Created ${input.kind === 'inventory' ? 'inventory' : 'stash'} "${input.name}" (${input.width}×${input.height})`;
  if (input.dryRun) return { dryRun: true, diff: { before: null, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    const id = repo.insertStorage(db, {
      characterId: character.id,
      kind: input.kind,
      name: input.name,
      width: input.width,
      height: input.height,
      maxWeight: input.maxWeight ?? null,
      sortOrder: input.sortOrder ?? 0,
    });
    after.id = id;
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'inventory.storage.create',
      entity: 'storage',
      entityId: id,
      before: null,
      after,
    });
  });
  return { dryRun: false, diff: { before: null, after, human }, eventId };
}

export function updateStorage(db: Db, id: number, patch: StoragePatch): WriteResult {
  const row = repo.getStorage(db, id);
  if (!row) throw new WriteError(404, 'STORAGE_NOT_FOUND', 'Storage not found');

  const merged = {
    name: patch.name ?? row.name,
    width: patch.width ?? row.width,
    height: patch.height ?? row.height,
    maxWeight: patch.maxWeight !== undefined ? patch.maxWeight : row.max_weight,
    sortOrder: patch.sortOrder ?? row.sort_order,
  };
  if (patch.name !== undefined && norm(patch.name) !== row.name_norm) {
    assertNameFree(db, row.character_id, row.kind, patch.name, id);
  }

  if (merged.width < row.width || merged.height < row.height) {
    const grid = { width: merged.width, height: merged.height };
    const offenders: number[] = [];
    for (const placement of repo.listStoragePlacements(db, id)) {
      if (placement.x == null || placement.y == null) continue;
      const rect = itemRect(
        placement.x,
        placement.y,
        placementSize(db, placement),
        placement.rotated === 1,
      );
      if (!fits(grid, rect)) offenders.push(placement.item_id);
    }
    if (offenders.length) {
      throw new WriteError(409, 'STORAGE_TOO_SMALL', 'Items do not fit the new storage size', {
        itemIds: offenders,
      });
    }
  }

  const before = storageSnapshot(row);
  const after = { ...before, ...merged, maxWeight: merged.maxWeight };
  const changes: string[] = [];
  if (before.name !== after.name) changes.push(`name: ${String(before.name)} → ${String(after.name)}`);
  if (before.width !== after.width || before.height !== after.height) {
    changes.push(`size: ${before.width}×${before.height} → ${after.width}×${after.height}`);
  }
  if (before.maxWeight !== after.maxWeight) changes.push('maxWeight changed');
  if (before.sortOrder !== after.sortOrder) changes.push('sortOrder changed');
  const human = changes.length ? `"${row.name}": ${changes.join(', ')}` : 'No changes';

  if (patch.dryRun) return { dryRun: true, diff: { before, after, human } };
  if (!changes.length) return { dryRun: false, diff: { before, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    repo.updateStorageRow(db, id, {
      name: merged.name,
      width: merged.width,
      height: merged.height,
      max_weight: merged.maxWeight,
      sort_order: merged.sortOrder,
    });
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'inventory.storage.update',
      entity: 'storage',
      entityId: id,
      before,
      after,
    });
  });
  return { dryRun: false, diff: { before, after, human }, eventId };
}

export function deleteStorage(
  db: Db,
  id: number,
  opts: { moveToStorageId?: number | null; dryRun: boolean },
): WriteResult {
  const row = repo.getStorage(db, id);
  if (!row) throw new WriteError(404, 'STORAGE_NOT_FOUND', 'Storage not found');
  if (row.kind === 'inventory') {
    throw new WriteError(422, 'VALIDATION', 'The inventory storage cannot be deleted');
  }

  const placements = repo.listStoragePlacements(db, id);
  const before = {
    ...storageSnapshot(row),
    itemIds: placements.map((placement) => placement.item_id),
    placements: placements.map((placement) => ({
      itemId: placement.item_id,
      placement: placementSnapshot(placement),
    })),
  };

  let target: repo.StorageRow | null = null;
  let placed: { id: number; x: number; y: number; rotated: boolean }[] = [];
  let movedToLoose = placements.map((placement) => placement.item_id);

  if (opts.moveToStorageId != null) {
    if (opts.moveToStorageId === id) {
      throw new WriteError(422, 'VALIDATION', 'Cannot move the items into the storage being deleted');
    }
    target = repo.getStorage(db, opts.moveToStorageId);
    if (!target) throw new WriteError(404, 'STORAGE_NOT_FOUND', 'Target storage not found');
    const occupied = repo
      .listStoragePlacements(db, target.id)
      .filter((placement) => placement.x != null && placement.y != null)
      .map((placement) =>
        itemRect(placement.x!, placement.y!, placementSize(db, placement), placement.rotated === 1),
      );
    const packed = packItems(
      { width: target.width, height: target.height },
      placements.map((placement) => ({ id: placement.item_id, size: placementSize(db, placement) })),
      occupied,
    );
    placed = packed.placed;
    movedToLoose = packed.unplaced;
  }

  const after =
    target && opts.moveToStorageId != null
      ? {
          deleted: true,
          movedTo: target.id,
          moved: placed.map((entry) => entry.id),
          movedToLoose,
        }
      : { deleted: true, movedToLoose };
  const movedCount = placements.length - movedToLoose.length;
  const human = placements.length
    ? `Deleted "${row.name}", moved ${movedCount} item(s)${movedToLoose.length ? `, ${movedToLoose.length} to loose` : ''}`
    : `Deleted "${row.name}"`;
  if (opts.dryRun) return { dryRun: true, diff: { before, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    for (const entry of placed) {
      repo.upsertPlacement(db, {
        itemId: entry.id,
        characterId: row.character_id,
        location: 'grid',
        storageId: target!.id,
        x: entry.x,
        y: entry.y,
        rotated: entry.rotated,
      });
    }
    for (const itemId of movedToLoose) {
      repo.upsertPlacement(db, { itemId, characterId: row.character_id, location: 'loose' });
    }
    repo.deleteStorageRow(db, id);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'inventory.storage.delete',
      entity: 'storage',
      entityId: id,
      before,
      after,
    });
  });
  return { dryRun: false, diff: { before, after, human }, eventId };
}

export function inventorySnapshot(db: Db, characterId: number): Record<string, unknown> {
  const storages = repo.listStorages(db, characterId);
  const items = repo.listInventoryItems(db, characterId);
  const itemIds = new Set(items.map((item) => item.id));
  const placements = repo.listPlacements(db, characterId).filter((placement) => itemIds.has(placement.item_id));
  const containerData: repo.ContainerDataRow[] = [];
  for (const item of items) {
    if (item.kind !== 'container') continue;
    const data = repo.getContainerData(db, item.id);
    if (data) containerData.push(data);
  }
  const layouts: repo.ItemLayoutRow[] = [];
  for (const itemId of new Set(items.map((item) => item.item_id))) {
    const layout = repo.getItemLayout(db, itemId);
    if (layout) layouts.push(layout);
  }
  return { storages, items, placements, containerData, layouts };
}
