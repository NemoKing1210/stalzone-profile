import type { InventoryItemCreate, InventoryItemPatch } from '@profile/shared';
import { rarityTierForPct } from '@profile/shared/ranks';
import type { Db } from '../../../platform/db/index.js';
import { logEvent, withTransaction, WriteError, type WriteResult } from '../../../platform/journal/index.js';
import { getItemById, resolveItem, resolveMotifExact } from '../../catalog/index.js';
import type { ItemRow } from '../../catalog/index.js';
import { characterOrThrow } from '../../identity/index.js';
import { resolveSize, resolveWeight } from '../layout/index.js';
import * as repo from '../repo/index.js';
import { ensureOverflowStorage, nextOverflowPlacement, packIntoOverflow } from './overflow.js';
import { itemSize, placementInputSnapshot, resolveTargetPlacement } from './placement.js';
import { inventoryItemSnapshot, placementSnapshot } from './snapshot.js';

export { inventoryItemSnapshot, itemContainerSnapshot, placementSnapshot } from './snapshot.js';

function parseRarityPct(quality: string | null): number | null {
  if (!quality) return null;
  const match = quality.match(/(\d+(?:[.,]\d+)?)\s*%?\s*$/);
  if (!match) return null;
  const value = Number(match[1]!.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 && value <= 175 ? value : null;
}

function findOverflowStack(db: Db, characterId: number, itemId: number): { id: number; qty: number } | null {
  return repo.findOverflowStackRow(db, characterId, itemId);
}

function assertQuantity(input: { kind: string; qty?: number }): void {
  if (input.kind !== 'ammo' && input.kind !== 'other' && (input.qty ?? 1) !== 1) {
    throw new WriteError(422, 'VALIDATION', 'Only ammo and consumables stack; every other kind has quantity 1');
  }
}

/** Only artifacts carry a quality/rarity roll; other kinds must not get one from a write. */
function assertRarityKind(kind: string, values: (string | number | null | undefined)[]): void {
  if (kind === 'artifact') return;
  if (values.some((value) => value !== undefined && value !== null)) {
    throw new WriteError(422, 'VALIDATION', 'Quality and rarity belong to artifacts');
  }
}

/** A skin must have been resolved for this exact base item; a guess is worse than a refusal. */
function assertSkinFits(itemId: number, kind: string, motif: { base_item_id: number | null } | null): void {
  if (!motif) return;
  if (kind !== 'weapon' && kind !== 'armor') {
    throw new WriteError(422, 'VALIDATION', 'Only weapons and armor take skins');
  }
  if (motif.base_item_id == null || motif.base_item_id !== itemId) {
    throw new WriteError(422, 'VALIDATION', 'The skin does not belong to this item');
  }
}

/**
 * Exact catalog id wins when the client sends one; a missing row or a row of another kind is
 * `UNKNOWN_ITEM` rather than a same-named item of the requested kind. Name resolution stays
 * as the fallback for callers that predate `catalogItemId`.
 */
function resolveCreateItem(db: Db, input: InventoryItemCreate): ItemRow {
  if (input.catalogItemId == null) return resolveItem(db, input.name, input.kind);
  const row = getItemById(db, input.catalogItemId);
  if (!row || row.kind !== input.kind) {
    throw new WriteError(422, 'UNKNOWN_ITEM', 'The catalog item does not exist for this kind', {
      catalogItemId: input.catalogItemId,
      kind: input.kind,
      foundKind: row?.kind ?? null,
    });
  }
  return row;
}

export function createInventoryItem(db: Db, input: InventoryItemCreate): WriteResult {
  const character = characterOrThrow(db);
  assertQuantity(input);

  const item = resolveCreateItem(db, input);
  const skin = input.skin ? resolveMotifExact(db, input.skin) : null;
  assertSkinFits(item.id, input.kind, skin);
  assertRarityKind(input.kind, [input.quality, input.rarityPct, input.rarityTier]);
  const rarityPct = input.rarityPct ?? parseRarityPct(input.quality ?? null);
  if (rarityPct != null && (rarityPct < 0 || rarityPct > 175)) {
    throw new WriteError(422, 'VALIDATION', 'Rarity must be between 0 and 175');
  }
  const rarityTier = input.rarityTier ?? rarityTierForPct(rarityPct);
  if (input.container && input.kind !== 'container') {
    throw new WriteError(422, 'NOT_A_CONTAINER', 'Container data belongs to a container item');
  }

  if ((input.kind === 'ammo' || input.kind === 'other') && input.target == null) {
    const stack = findOverflowStack(db, character.id, item.id);
    if (stack) {
      const before = inventoryItemSnapshot(db, stack.id);
      const after = { ...before, qty: stack.qty + (input.qty ?? 1) };
      const human = `Quantity of "${item.name}": ${stack.qty} → ${after.qty}`;
      if (input.dryRun) return { dryRun: true, diff: { before, after, human } };
      let eventId: number | undefined;
      withTransaction(db, () => {
        repo.updateInventoryItemRow(db, stack.id, { qty: after.qty as number });
        eventId = logEvent(db, {
          actor: 'owner',
          action: 'inventory.item.update',
          entity: 'inventory',
          entityId: stack.id,
          before,
          after,
        });
      });
      return { dryRun: false, diff: { before, after, human }, eventId };
    }
  }

  if (input.target == null && !input.dryRun) ensureOverflowStorage(db, character.id);

  const layout = repo.getItemLayout(db, item.id);
  const size = resolveSize(input.kind, item.category, layout ? { width: layout.width, height: layout.height } : null);

  let next: repo.PlacementInput;
  if (input.target) {
    next = resolveTargetPlacement(
      db,
      {
        id: -1,
        item_id: item.id,
        character_id: character.id,
        kind: input.kind,
        category: item.category,
        level: input.level,
      },
      null,
      input.target,
      { swap: false },
    ).next;
  } else {
    const spot = nextOverflowPlacement(db, character.id, size);
    next = {
      itemId: -1,
      characterId: character.id,
      location: 'grid',
      storageId: spot.storageId,
      x: spot.x,
      y: spot.y,
    };
  }

  const after: Record<string, unknown> = {
    id: null,
    itemId: item.id,
    name: input.displayName ?? item.name,
    displayName: input.displayName ?? null,
    kind: input.kind,
    category: item.category,
    rank: item.rank,
    level: input.level,
    quality: input.quality ?? null,
    rarityPct,
    rarityTier,
    skinItemId: skin?.id ?? null,
    qty: input.qty,
    virtual: input.virtual,
    slot: item.slot,
    icon: null,
    weight: resolveWeight(item.weight, null),
    size,
    placement: placementInputSnapshot(next),
    container: input.container
      ? {
          type: input.container.type ?? null,
          shield: input.container.shield ?? null,
          bonus: input.container.bonus ?? null,
          protection: input.container.protection ?? null,
          slots: input.container.slots ?? null,
          eff: input.container.eff ?? null,
        }
      : null,
  };
  const human = `Added "${item.name}"${(input.qty ?? 1) > 1 ? ` ×${input.qty}` : ''}`;
  if (input.dryRun) return { dryRun: true, diff: { before: null, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    const id = repo.insertInventoryItem(db, {
      characterId: character.id,
      itemId: item.id,
      kind: input.kind,
      level: input.level,
      quality: input.quality ?? null,
      rarityPct,
      rarityTier,
      skinItemId: skin?.id ?? null,
      qty: input.qty,
      virtual: input.virtual,
      displayName: input.displayName ?? null,
      slot: item.slot,
    });
    repo.upsertPlacement(db, { ...next, itemId: id });
    if (input.container) {
      repo.upsertContainerData(db, id, {
        type: input.container.type ?? null,
        shield: input.container.shield ?? null,
        bonus: input.container.bonus ?? null,
        protection: input.container.protection ?? null,
        slots: input.container.slots ?? null,
        eff: input.container.eff ?? null,
      });
    }
    after.id = id;
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'inventory.item.create',
      entity: 'inventory',
      entityId: id,
      before: null,
      after,
    });
  });
  return { dryRun: false, diff: { before: null, after, human }, eventId };
}

function mergeContainer(
  current: repo.ContainerDataRow | null,
  patch: NonNullable<InventoryItemPatch['container']> | null | undefined,
): repo.ContainerDataInput | null {
  if (patch === undefined) {
    return current
      ? {
          type: current.type,
          shield: current.shield,
          bonus: current.bonus,
          protection: current.protection,
          slots: current.slots,
          eff: current.eff,
        }
      : null;
  }
  if (patch === null) return null;
  return {
    type: patch.type !== undefined ? patch.type : (current?.type ?? null),
    shield: patch.shield !== undefined ? patch.shield : (current?.shield ?? null),
    bonus: patch.bonus !== undefined ? patch.bonus : (current?.bonus ?? null),
    protection: patch.protection !== undefined ? patch.protection : (current?.protection ?? null),
    slots: patch.slots !== undefined ? patch.slots : (current?.slots ?? null),
    eff: patch.eff !== undefined ? patch.eff : (current?.eff ?? null),
  };
}

export function updateInventoryItem(db: Db, id: number, patch: InventoryItemPatch): WriteResult {
  const row = repo.getInventoryItem(db, id);
  if (!row) throw new WriteError(404, 'ITEM_NOT_FOUND', 'Inventory item not found');
  if (patch.container !== undefined && row.kind !== 'container') {
    throw new WriteError(422, 'NOT_A_CONTAINER', 'Container data belongs to a container item');
  }

  let skinItemId = row.skin_item_id;
  let skinName = row.skin_name;
  if (patch.skin !== undefined) {
    if (patch.skin === null) {
      skinItemId = null;
      skinName = null;
    } else {
      const motif = resolveMotifExact(db, patch.skin);
      assertSkinFits(row.item_id, row.kind, motif);
      skinItemId = motif.id;
      skinName = motif.name;
    }
  }

  assertRarityKind(row.kind, [patch.quality, patch.rarityPct, patch.rarityTier]);

  const qty = patch.qty ?? row.qty;
  if (row.kind !== 'ammo' && row.kind !== 'other' && qty !== 1) {
    throw new WriteError(422, 'VALIDATION', 'Weapons, armor, containers and artifacts have quantity 1');
  }

  const currentContainer = repo.getContainerData(db, id);
  const container = mergeContainer(currentContainer, patch.container);
  if (container?.slots != null) {
    const displaced = repo
      .listPlacements(db, row.character_id)
      .filter(
        (placement) =>
          placement.container_item_id === id &&
          placement.container_slot != null &&
          placement.container_slot >= container.slots!,
      )
      .map((placement) => placement.item_id);
    if (displaced.length) {
      throw new WriteError(409, 'CONTAINER_SLOTS_IN_USE', 'Remove the installed artifacts first', {
        itemIds: displaced,
      });
    }
  }

  const rarityPct = patch.rarityPct === undefined ? row.rarity_pct : patch.rarityPct;
  const rarityTier =
    patch.rarityTier !== undefined
      ? patch.rarityTier
      : patch.rarityPct !== undefined
        ? rarityTierForPct(rarityPct)
        : row.rarity_tier;

  const merged = {
    level: patch.level ?? row.level,
    quality: patch.quality === undefined ? row.quality : patch.quality,
    rarityPct,
    rarityTier,
    qty,
    virtual: patch.virtual === undefined ? row.is_virtual === 1 : patch.virtual,
    displayName: patch.displayName === undefined ? row.display_name : patch.displayName,
    skinItemId,
    skinName,
  };

  const before = inventoryItemSnapshot(db, id)!;
  const after = {
    ...before,
    ...merged,
    name: merged.displayName ?? row.item_name,
    container: container
      ? {
          type: container.type ?? null,
          shield: container.shield ?? null,
          bonus: container.bonus ?? null,
          protection: container.protection ?? null,
          slots: container.slots ?? null,
          eff: container.eff ?? null,
        }
      : null,
  };
  const changes: string[] = [];
  for (const key of ['level', 'quality', 'rarityPct', 'rarityTier', 'qty', 'virtual'] as const) {
    if (before[key] !== after[key]) changes.push(`${key}: ${String(before[key])} → ${String(after[key])}`);
  }
  if (before.name !== after.name) changes.push(`name: ${before.name} → ${after.name}`);
  if (before.skinItemId !== merged.skinItemId) {
    changes.push(`skin: ${String(before.skinName)} → ${String(merged.skinName)}`);
  }
  if (JSON.stringify(before.container) !== JSON.stringify(after.container)) changes.push('container: changed');
  const human = changes.length ? `"${row.display_name ?? row.item_name}": ${changes.join(', ')}` : 'No changes';

  if (patch.dryRun) return { dryRun: true, diff: { before, after, human } };
  if (!changes.length) return { dryRun: false, diff: { before, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    repo.updateInventoryItemRow(db, id, {
      level: merged.level,
      quality: merged.quality,
      rarity_pct: merged.rarityPct,
      rarity_tier: merged.rarityTier,
      skin_item_id: merged.skinItemId,
      qty: merged.qty,
      is_virtual: merged.virtual ? 1 : 0,
      display_name: merged.displayName,
    });
    if (patch.container !== undefined) {
      if (container === null) repo.deleteContainerData(db, id);
      else repo.upsertContainerData(db, id, container);
    }
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'inventory.item.update',
      entity: 'inventory',
      entityId: id,
      before,
      after,
    });
  });
  return { dryRun: false, diff: { before, after, human }, eventId };
}

export function deleteInventoryItem(
  db: Db,
  id: number,
  opts: { qty?: number; dryRun: boolean },
): WriteResult {
  const row = repo.getInventoryItem(db, id);
  if (!row) throw new WriteError(404, 'ITEM_NOT_FOUND', 'Inventory item not found');

  const remove = Math.min(Math.max(1, Math.trunc(opts.qty ?? 1)), row.qty);
  const remaining = row.qty - remove;
  const before = inventoryItemSnapshot(db, id)!;

  if (remaining > 0) {
    const after = { ...before, qty: remaining };
    const human = `Quantity of "${row.display_name ?? row.item_name}": ${row.qty} → ${remaining}`;
    if (opts.dryRun) return { dryRun: true, diff: { before, after, human } };
    let eventId: number | undefined;
    withTransaction(db, () => {
      repo.updateInventoryItemRow(db, id, { qty: remaining });
      eventId = logEvent(db, {
        actor: 'owner',
        action: 'inventory.item.delete',
        entity: 'inventory',
        entityId: id,
        before,
        after,
      });
    });
    return { dryRun: false, diff: { before, after, human }, eventId };
  }

  const childPlacements = repo
    .listPlacements(db, row.character_id)
    .filter((placement) => placement.container_item_id === id || placement.weapon_item_id === id);
  const children = childPlacements.map((placement) => placement.item_id);
  const beforeDelete = {
    ...before,
    children: childPlacements.map((placement) => ({
      itemId: placement.item_id,
      placement: placementSnapshot(placement),
    })),
  };
  if (children.length && !opts.dryRun) ensureOverflowStorage(db, row.character_id);
  const intake = children.length ? repo.getOverflowStorage(db, row.character_id) : null;
  const packed = children.length
    ? packIntoOverflow(
        db,
        row.character_id,
        childPlacements.map((placement) => ({
          id: placement.item_id,
          size: itemSize(db, repo.getInventoryItem(db, placement.item_id)!),
        })),
      )
    : [];

  const after = children.length ? { deleted: true, movedToOverflow: children } : { deleted: true };
  const human = children.length
    ? `Removed "${row.display_name ?? row.item_name}", moved ${children.length} item(s) to the intake stash`
    : `Removed "${row.display_name ?? row.item_name}"`;
  if (opts.dryRun) return { dryRun: true, diff: { before: beforeDelete, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    for (const entry of packed) {
      repo.upsertPlacement(db, {
        itemId: entry.id,
        characterId: row.character_id,
        location: 'grid',
        storageId: intake!.id,
        x: entry.x,
        y: entry.y,
      });
    }
    repo.deleteInventoryItemRow(db, id);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'inventory.item.delete',
      entity: 'inventory',
      entityId: id,
      before: beforeDelete,
      after,
    });
  });
  return { dryRun: false, diff: { before: beforeDelete, after, human }, eventId };
}
