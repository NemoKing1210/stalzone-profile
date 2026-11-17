import type { ContainerFill, OwnedCreate, OwnedPatch } from '@profile/shared';
import type { Db } from '../../platform/db/index.js';
import { logEvent, withTransaction, WriteError, type WriteResult } from '../../platform/journal/index.js';
import { resolveItem, resolveMotifExact } from '../catalog/index.js';
import { characterOrThrow } from '../identity/index.js';
import * as repo from './repo/owned.js';
import type { OwnedPatch as OwnedColumnPatch, OwnedJoined } from './repo/owned.js';

interface ContainerSnapshot {
  containerType: string | null;
  shield: number | null;
  bonus: string | null;
  protection: number | null;
  slots: number | null;
  eff: number | null;
}

type ContainerPatch = Partial<ContainerSnapshot>;

export function containerSnapshot(db: Db, ownedId: number): ContainerSnapshot | null {
  const row = repo.getOwnedContainer(db, ownedId);
  if (!row) return null;
  return {
    containerType: row.container_type,
    shield: row.shield,
    bonus: row.bonus,
    protection: row.protection,
    slots: row.slots,
    eff: row.eff,
  };
}

export function mergeContainer(
  current: ContainerSnapshot | null,
  patch: ContainerPatch | null | undefined,
): ContainerSnapshot | null {
  if (patch === undefined) return current;
  if (patch === null) return null;
  // An absent key keeps the current value; an explicit null clears it.
  const pick = <K extends keyof ContainerSnapshot>(key: K): ContainerSnapshot[K] =>
    patch[key] !== undefined ? (patch[key] as ContainerSnapshot[K]) : (current?.[key] ?? null);
  return {
    containerType: pick('containerType'),
    shield: pick('shield'),
    bonus: pick('bonus'),
    protection: pick('protection'),
    slots: pick('slots'),
    eff: pick('eff'),
  };
}

export function fillSnapshot(db: Db, ownedId: number) {
  const rows = repo.listContainerSlots(db, ownedId);
  return {
    ownedId,
    asOf: rows[0]?.as_of ?? null,
    artifacts: rows.map((row) => ({
      itemId: row.artifact_item_id,
      name: row.artifact_name ?? null,
      level: row.level,
      quality: row.quality,
    })),
  };
}

export function ownedSnapshot(db: Db, row: OwnedJoined) {
  return {
    id: row.id,
    itemId: row.item_id,
    name: row.display_name ?? row.item_name,
    kind: row.kind,
    level: row.level,
    quality: row.quality,
    skinItemId: row.skin_item_id,
    skinName: row.skin_name,
    qty: row.qty,
    note: row.note,
    role: row.role,
    slot: row.slot,
    displayName: row.display_name,
    container: containerSnapshot(db, row.id),
  };
}

export function ownedCleanupSnapshot(db: Db, row: OwnedJoined) {
  const snapshot: Record<string, unknown> = ownedSnapshot(db, row);
  if (row.kind === 'container') snapshot.fill = fillSnapshot(db, row.id);
  return snapshot;
}

export function createOwned(db: Db, input: OwnedCreate): WriteResult {
  const character = characterOrThrow(db);
  const item = resolveItem(db, input.name, input.kind);
  const skin = input.skin ? resolveMotifExact(db, input.skin) : null;
  const skinItemId = skin?.id ?? null;
  const quality = input.quality ?? null;
  const existing = repo.findOwned(db, character.id, item.id, input.level, quality, skinItemId);
  const existingRow = existing ? repo.getOwned(db, existing.id) : null;
  const qty = (existing?.qty ?? 0) + input.qty;
  const before = existingRow ? ownedSnapshot(db, existingRow) : null;
  const container = input.container
    ? mergeContainer(existingRow ? containerSnapshot(db, existingRow.id) : null, input.container)
    : existingRow
      ? containerSnapshot(db, existingRow.id)
      : null;
  const after = {
    id: existing?.id ?? null,
    itemId: item.id,
    name: item.name,
    kind: input.kind,
    level: input.level,
    quality,
    skinItemId,
    skinName: skin?.name ?? existingRow?.skin_name ?? null,
    qty,
    note: input.note ?? existing?.note ?? null,
    role: input.role ?? existing?.role ?? null,
    slot: input.slot ?? existing?.slot ?? item.slot ?? null,
    displayName: item.name,
    container,
  };
  const human = existing
    ? `Quantity of "${item.name}": ${existing.qty} → ${qty}`
    : `Added "${item.name}" ×${qty}`;

  if (input.dryRun) return { dryRun: true, diff: { before, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    const id = repo.upsertOwned(db, {
      characterId: character.id,
      itemId: item.id,
      kind: input.kind,
      level: input.level,
      skinItemId,
      quality,
      note: after.note,
      role: after.role,
      slot: after.slot,
      qty,
      displayName: item.name,
      container: container ?? undefined,
    });
    after.id = id;
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'owned.create',
      entity: 'owned',
      entityId: id,
      before,
      after,
    });
  });
  return { dryRun: false, diff: { before, after, human }, eventId };
}

export function updateOwned(db: Db, id: number, patch: OwnedPatch): WriteResult {
  const row = repo.getOwned(db, id);
  if (!row) throw new WriteError(404, 'OWNED_NOT_FOUND', 'Record not found');

  let skinItemId = row.skin_item_id;
  let skinName = row.skin_name;
  if (patch.skin !== undefined) {
    if (patch.skin === null) {
      skinItemId = null;
      skinName = null;
    } else {
      const motif = resolveMotifExact(db, patch.skin);
      skinItemId = motif.id;
      skinName = motif.name;
    }
  }

  const merged = {
    level: patch.level ?? row.level,
    quality: patch.quality === undefined ? row.quality : patch.quality,
    note: patch.note === undefined ? row.note : patch.note,
    role: patch.role === undefined ? row.role : patch.role,
    slot: patch.slot === undefined ? row.slot : patch.slot,
    qty: patch.qty ?? row.qty,
    displayName: patch.displayName === undefined ? row.display_name : patch.displayName,
    skinItemId,
    skinName,
    container: mergeContainer(containerSnapshot(db, row.id), patch.container),
  };

  const clash = repo.findOwned(db, row.character_id, row.item_id, merged.level, merged.quality, merged.skinItemId);
  if (clash && clash.id !== row.id) {
    throw new WriteError(409, 'OWNED_CONFLICT', 'Such a record already exists — change the quantity in it', {
      ownedId: clash.id,
    });
  }

  const before = ownedSnapshot(db, row);
  const after = { ...before, ...merged, name: merged.displayName ?? row.item_name };
  const changes: string[] = [];
  for (const key of ['level', 'quality', 'qty', 'note', 'role', 'slot'] as const) {
    if (before[key] !== after[key]) changes.push(`${key}: ${String(before[key])} → ${String(after[key])}`);
  }
  if (before.name !== after.name) changes.push(`name: ${before.name} → ${after.name}`);
  if (before.skinItemId !== after.skinItemId) changes.push('skin: changed');
  if (JSON.stringify(before.container) !== JSON.stringify(after.container)) changes.push('container: changed');
  const human = changes.length ? `"${row.display_name ?? row.item_name}": ${changes.join(', ')}` : 'No changes';

  if (patch.dryRun) return { dryRun: true, diff: { before, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    repo.updateOwnedById(db, row.id, {
      level: merged.level,
      quality: merged.quality,
      note: merged.note,
      role: merged.role,
      slot: merged.slot,
      skin_item_id: merged.skinItemId,
      qty: merged.qty,
      display_name: merged.displayName,
      container:
        patch.container === undefined
          ? undefined
          : merged.container === null
            ? null
            : (merged.container as repo.ContainerInput),
    });
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'owned.update',
      entity: 'owned',
      entityId: row.id,
      before,
      after,
    });
  });
  return { dryRun: false, diff: { before, after, human }, eventId };
}

export function deleteOwned(db: Db, id: number, opts: { dryRun: boolean; qty?: number }): WriteResult {
  const row = repo.getOwned(db, id);
  if (!row) throw new WriteError(404, 'OWNED_NOT_FOUND', 'Record not found');

  const remove = Math.min(Math.max(1, Math.trunc(opts.qty ?? 1)), row.qty);
  const remaining = row.qty - remove;
  const before: Record<string, unknown> = { ...ownedSnapshot(db, row) };
  if (row.kind === 'container') before.fill = fillSnapshot(db, row.id);
  const after = remaining > 0 ? { ...before, qty: remaining } : null;
  const name = row.display_name ?? row.item_name;
  const human = remaining > 0 ? `Quantity of "${name}": ${row.qty} → ${remaining}` : `Removed "${name}"`;

  if (opts.dryRun) return { dryRun: true, diff: { before, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    if (remaining > 0) repo.updateOwnedById(db, row.id, { qty: remaining });
    else repo.deleteOwned(db, row.id);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'owned.delete',
      entity: 'owned',
      entityId: row.id,
      before,
      after,
    });
  });
  return { dryRun: false, diff: { before, after, human }, eventId };
}

export function setContainerFill(db: Db, id: number, input: ContainerFill): WriteResult {
  const row = repo.getOwned(db, id);
  if (!row) throw new WriteError(404, 'OWNED_NOT_FOUND', 'Container not found');
  if (row.kind !== 'container') throw new WriteError(422, 'NOT_A_CONTAINER', 'This record is not a container');

  const before = fillSnapshot(db, id);
  const artifacts = input.artifacts.map((artifact) => {
    const item = resolveItem(db, artifact.name, 'artifact');
    return { itemId: item.id, name: item.name, level: artifact.level, quality: artifact.quality ?? null };
  });
  const asOf = input.asOf ?? new Date().toISOString();
  const after = { ownedId: id, asOf, artifacts };
  const human = `Container fill "${row.display_name ?? row.item_name}": ${before.artifacts.length} → ${artifacts.length}`;

  if (input.dryRun) return { dryRun: true, diff: { before, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    repo.replaceContainerSlots(
      db,
      id,
      artifacts.map((artifact) => ({
        itemId: artifact.itemId,
        level: artifact.level,
        quality: artifact.quality,
      })),
      asOf,
    );
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'container.fill',
      entity: 'container',
      entityId: id,
      before,
      after,
    });
  });
  return { dryRun: false, diff: { before, after, human }, eventId };
}

/* ------------------------------ restore / clear (transaction-scoped) ------------------------------ */

/** Restores one owned snapshot. Assumes the caller holds the transaction. */
export function restoreOwnedTx(db: Db, snapshot: any, characterId: number): void {
  if (!snapshot) return;
  const restoredId = repo.upsertOwned(db, {
    characterId,
    itemId: snapshot.itemId,
    kind: snapshot.kind,
    level: snapshot.level,
    quality: snapshot.quality,
    skinItemId: snapshot.skinItemId,
    qty: snapshot.qty,
    note: snapshot.note,
    role: snapshot.role,
    slot: snapshot.slot,
    displayName: snapshot.displayName ?? snapshot.name,
  });
  if (snapshot.container) repo.upsertOwnedContainer(db, restoredId, snapshot.container);
  else repo.deleteOwnedContainer(db, restoredId);
  const fill = snapshot.fill as { asOf?: string | null; artifacts?: any[] } | null | undefined;
  if (fill) {
    repo.replaceContainerSlots(
      db,
      restoredId,
      (fill.artifacts ?? []).map((artifact) => ({
        itemId: artifact.itemId,
        level: artifact.level,
        quality: artifact.quality,
      })),
      fill.asOf ?? new Date().toISOString(),
    );
  }
}

/** Deletes one owned row without logging. Assumes the caller holds the transaction. */
export function deleteOwnedTx(db: Db, id: number): void {
  repo.deleteOwned(db, id);
}

/** Deletes every owned row of the character and returns the snapshots needed to restore them. */
export function clearOwnedTx(db: Db, characterId: number): Record<string, unknown>[] {
  const rows = repo.listOwned(db, characterId);
  const snapshots = rows.map((row) => ownedCleanupSnapshot(db, row));
  for (const row of rows) repo.deleteOwned(db, row.id);
  return snapshots;
}

/** Applies one `owned.update` snapshot. Assumes the caller holds the transaction. */
export function updateOwnedTx(db: Db, snapshot: any): void {
  if (!snapshot?.id) return;
  repo.updateOwnedById(db, snapshot.id, {
    level: snapshot.level,
    quality: snapshot.quality,
    skin_item_id: snapshot.skinItemId ?? null,
    qty: snapshot.qty,
    note: snapshot.note,
    role: snapshot.role,
    slot: snapshot.slot,
    display_name: snapshot.displayName ?? snapshot.name ?? null,
    container: snapshot.container ? { ...snapshot.container } : null,
  } satisfies OwnedColumnPatch);
}

/** Restores a `container.fill` event state. Assumes the caller holds the transaction. */
export function restoreContainerFillTx(db: Db, target: any): void {
  if (!target) return;
  if (!repo.getOwned(db, target.ownedId)) {
    throw new WriteError(409, 'OWNED_NOT_FOUND', 'Container to roll back not found');
  }
  repo.replaceContainerSlots(
    db,
    target.ownedId,
    (target.artifacts ?? []).map((artifact: any) => ({
      itemId: artifact.itemId,
      level: artifact.level,
      quality: artifact.quality,
    })),
    target.asOf ?? new Date().toISOString(),
  );
}
