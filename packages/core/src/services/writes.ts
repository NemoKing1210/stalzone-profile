import { norm } from '@dossier/shared';
import type {
  BuildInput as BuildInputPayload,
  CharacterPatch,
  ContainerFill,
  ContentBlockInput,
  OwnedCreate,
  OwnedPatch,
} from '@dossier/shared';
import type { Db } from '../db/index.js';
import * as repo from '../repo/index.js';
import type { BuildSlotRow, CharacterRow, ContentBlockRow, OwnedRow } from '../repo/index.js';

export interface WriteDiff {
  before: unknown;
  after: unknown;
  human: string;
}

export interface WriteResult {
  dryRun: boolean;
  diff: WriteDiff;
  eventId?: number;
}

export class WriteError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'WriteError';
  }
}

/* ------------------------------ helpers ------------------------------ */

function parseJson(value: string | null | undefined): unknown {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function characterOrThrow(db: Db): CharacterRow {
  const character = repo.getCharacter(db);
  if (!character) throw new WriteError(409, 'NO_CHARACTER', 'No character in the dossier — import the dossier first');
  return character;
}

function distance(a: string, b: string): number {
  const rows = b.length + 1;
  let previous = Array.from({ length: rows }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = (a[i - 1] ?? '') === (b[j - 1] ?? '') ? 0 : 1;
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

function suggestionsFor(db: Db, name: string, kind: string): string[] {
  const query = norm(name);
  return repo
    .listItems(db, kind)
    .map((item) => ({ name: item.name, distance: distance(query, item.name_norm) }))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((entry) => entry.name);
}

function resolveItem(db: Db, name: string, kind: string) {
  const item = repo.findItemByKindName(db, kind, name) ?? repo.searchItems(db, { q: name, kind, limit: 1 })[0];
  if (!item) {
    throw new WriteError(422, 'UNKNOWN_ITEM', `Item "${name}" not found`, {
      query: name,
      kind,
      suggestions: suggestionsFor(db, name, kind),
    });
  }
  return item;
}

function resolveOptionalItem(db: Db, name: string | null | undefined) {
  if (!name) return null;
  return (
    repo.findItemByKindName(db, 'artifact', name) ??
    repo.findItemByKindName(db, 'weapon', name) ??
    repo.findItemByKindName(db, 'armor', name) ??
    repo.findItemByKindName(db, 'container', name) ??
    repo.searchItems(db, { q: name, limit: 1 })[0] ??
    null
  );
}

/** Skins may only bind by their exact motif name; guessing an "almost same" motif is worse than failing. */
function resolveMotifExact(db: Db, name: string) {
  const item = repo.findItemByKindName(db, 'motif', name);
  if (!item) {
    throw new WriteError(422, 'UNKNOWN_ITEM', `Skin "${name}" not found`, {
      query: name,
      kind: 'motif',
      suggestions: suggestionsFor(db, name, 'motif'),
    });
  }
  return item;
}

function ownedSnapshot(row: OwnedRow, itemName?: string) {
  return {
    id: row.id,
    itemId: row.item_id,
    name: row.display_name ?? itemName ?? '',
    kind: row.kind,
    level: row.level,
    quality: row.quality,
    skinItemId: row.skin_item_id,
    qty: row.qty,
    note: row.note,
    role: row.role,
    slot: row.slot,
    extra: parseJson(row.extra),
  };
}


/* ------------------------------ cleanup counts ------------------------------ */

export interface CleanupCounts {
  owned: { records: number; copies: number };
  builds: number;
}

export function cleanupCounts(db: Db): CleanupCounts {
  const character = repo.getCharacter(db);
  return {
    owned: character ? repo.ownedCounts(db, character.id) : { records: 0, copies: 0 },
    builds: repo.countBuilds(db),
  };
}

/* ------------------------------ character ------------------------------ */

const CHARACTER_FIELDS = [
  ['nick', 'nick'],
  ['faction', 'faction'],
  ['alliance', 'alliance'],
  ['clan', 'clan'],
  ['arrived', 'arrived'],
  ['hours', 'hours'],
  ['kd', 'kd'],
  ['accuracy', 'accuracy'],
  ['headshot', 'headshot'],
  ['achievements', 'achievements'],
  ['achievementPoints', 'achievement_points'],
  ['money', 'money'],
  ['maxMoney', 'max_money'],
  ['stash', 'stash'],
  ['playstyle', 'playstyle'],
] as const;

function characterSnapshot(row: CharacterRow): Record<string, unknown> {
  const out: Record<string, unknown> = { id: row.id };
  for (const [key, column] of CHARACTER_FIELDS) out[key] = row[column as keyof CharacterRow] ?? null;
  return out;
}

export function patchCharacter(db: Db, patch: CharacterPatch): WriteResult {
  const character = characterOrThrow(db);
  const before = characterSnapshot(character);
  const defined: Record<string, unknown> = {};
  for (const [key] of CHARACTER_FIELDS) {
    if (patch[key as keyof typeof patch] !== undefined) defined[key] = patch[key as keyof typeof patch];
  }
  const after = { ...before, ...defined };
  const changed = Object.keys(defined);
  const human = changed.length
    ? `Character: ${changed.map((key) => `${key} ${String(before[key])} → ${String(after[key])}`).join(', ')}`
    : 'No changes';

  if (patch.dryRun) return { dryRun: true, diff: { before, after, human } };

  let eventId: number | undefined;
  db.transaction(() => {
    repo.updateCharacterById(db, character.id, defined);
    eventId = repo.logEvent(db, {
      actor: 'owner',
      action: 'character.update',
      entity: 'character',
      entityId: character.id,
      before,
      after,
    });
  })();
  return { dryRun: false, diff: { before, after, human }, eventId };
}

/* ------------------------------ owned ------------------------------ */

export function createOwned(db: Db, input: OwnedCreate): WriteResult {
  const character = characterOrThrow(db);
  const item = resolveItem(db, input.name, input.kind);
  const skinItemId = input.skin ? resolveMotifExact(db, input.skin).id : null;
  const quality = input.quality ?? null;
  const existing = repo.findOwned(db, character.id, item.id, input.level, quality, skinItemId);
  const qty = (existing?.qty ?? 0) + input.qty;
  const before = existing ? ownedSnapshot(existing, item.name) : null;
  const extra =
    input.skin === undefined
      ? undefined
      : { ...((existing ? parseJson(existing.extra) : null) as Record<string, unknown> | null), skin: input.skin };
  const after = {
    id: existing?.id ?? null,
    itemId: item.id,
    name: item.name,
    kind: input.kind,
    level: input.level,
    quality,
    skinItemId,
    qty,
    note: input.note ?? existing?.note ?? null,
    role: input.role ?? existing?.role ?? null,
    slot: input.slot ?? existing?.slot ?? item.slot ?? null,
    extra: extra ?? (existing ? parseJson(existing.extra) : null),
  };
  const human = existing
    ? `Quantity of "${item.name}": ${existing.qty} → ${qty}`
    : `Added "${item.name}" ×${qty}`;

  if (input.dryRun) return { dryRun: true, diff: { before, after, human } };

  let eventId: number | undefined;
  db.transaction(() => {
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
      extra,
    });
    after.id = id;
    eventId = repo.logEvent(db, {
      actor: 'owner',
      action: 'owned.create',
      entity: 'owned',
      entityId: id,
      before,
      after,
    });
  })();
  return { dryRun: false, diff: { before, after, human }, eventId };
}

export function updateOwned(db: Db, id: number, patch: OwnedPatch): WriteResult {
  const row = repo.getOwned(db, id);
  if (!row) throw new WriteError(404, 'OWNED_NOT_FOUND', 'Record not found');

  const currentExtra = (parseJson(row.extra) ?? {}) as Record<string, unknown>;
  const currentSkin = typeof currentExtra.skin === 'string' ? currentExtra.skin : null;
  let skinItemId = row.skin_item_id;
  let extra = row.extra;
  if (patch.skin !== undefined) {
    if (patch.skin === null) {
      skinItemId = null;
      extra = JSON.stringify({ ...currentExtra, skin: null });
    } else if (currentSkin !== null && patch.skin === currentSkin) {
      // Unchanged legacy skin string: keep the existing mapping (possibly none) instead of guessing.
    } else {
      skinItemId = resolveMotifExact(db, patch.skin).id;
      extra = JSON.stringify({ ...currentExtra, skin: patch.skin });
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
    extra: parseJson(extra),
  };

  const clash = repo.findOwned(db, row.character_id, row.item_id, merged.level, merged.quality, merged.skinItemId);
  if (clash && clash.id !== row.id) {
    throw new WriteError(409, 'OWNED_CONFLICT', 'Such a record already exists — change the quantity in it', {
      ownedId: clash.id,
    });
  }

  const before = ownedSnapshot(row, row.item_name);
  const after = { ...before, ...merged, name: merged.displayName ?? row.item_name };
  const changes: string[] = [];
  for (const key of ['level', 'quality', 'qty', 'note', 'role', 'slot'] as const) {
    if (before[key] !== after[key]) changes.push(`${key}: ${String(before[key])} → ${String(after[key])}`);
  }
  if (before.name !== after.name) changes.push(`name: ${before.name} → ${after.name}`);
  if (before.skinItemId !== after.skinItemId) changes.push('skin: changed');
  const human = changes.length ? `"${row.display_name ?? row.item_name}": ${changes.join(', ')}` : 'No changes';

  if (patch.dryRun) return { dryRun: true, diff: { before, after, human } };

  let eventId: number | undefined;
  db.transaction(() => {
    repo.updateOwnedById(db, row.id, {
      level: merged.level,
      quality: merged.quality,
      note: merged.note,
      role: merged.role,
      slot: merged.slot,
      skin_item_id: merged.skinItemId,
      qty: merged.qty,
      display_name: merged.displayName,
      extra: merged.extra == null ? null : JSON.stringify(merged.extra),
    });
    eventId = repo.logEvent(db, {
      actor: 'owner',
      action: 'owned.update',
      entity: 'owned',
      entityId: row.id,
      before,
      after,
    });
  })();
  return { dryRun: false, diff: { before, after, human }, eventId };
}

export function deleteOwned(db: Db, id: number, opts: { dryRun: boolean; qty?: number }): WriteResult {
  const row = repo.getOwned(db, id);
  if (!row) throw new WriteError(404, 'OWNED_NOT_FOUND', 'Record not found');

  const remove = Math.min(Math.max(1, Math.trunc(opts.qty ?? 1)), row.qty);
  const remaining = row.qty - remove;
  const before: Record<string, unknown> = { ...ownedSnapshot(row) };
  if (row.kind === 'container') before.fill = containerFillSnapshot(db, row.id);
  const after = remaining > 0 ? { ...before, qty: remaining } : null;
  const name = row.display_name ?? row.item_name;
  const human = remaining > 0 ? `Quantity of "${name}": ${row.qty} → ${remaining}` : `Removed "${name}"`;

  if (opts.dryRun) return { dryRun: true, diff: { before, after, human } };

  let eventId: number | undefined;
  db.transaction(() => {
    if (remaining > 0) repo.updateOwnedById(db, row.id, { qty: remaining });
    else repo.deleteOwned(db, row.id);
    eventId = repo.logEvent(db, {
      actor: 'owner',
      action: 'owned.delete',
      entity: 'owned',
      entityId: row.id,
      before,
      after,
    });
  })();
  return { dryRun: false, diff: { before, after, human }, eventId };
}

/* ------------------------------ containers ------------------------------ */

function containerFillSnapshot(db: Db, ownedId: number) {
  const rows = repo.listContainerFill(db, ownedId);
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

export function setContainerFill(db: Db, id: number, input: ContainerFill): WriteResult {
  const row = repo.getOwned(db, id);
  if (!row) throw new WriteError(404, 'OWNED_NOT_FOUND', 'Container not found');
  if (row.kind !== 'container') throw new WriteError(422, 'NOT_A_CONTAINER', 'This record is not a container');

  const before = containerFillSnapshot(db, id);
  const artifacts = input.artifacts.map((artifact) => {
    const item = resolveItem(db, artifact.name, 'artifact');
    return { itemId: item.id, name: item.name, level: artifact.level, quality: artifact.quality ?? null };
  });
  const asOf = input.asOf ?? new Date().toISOString();
  const after = { ownedId: id, asOf, artifacts };
  const human = `Container fill "${row.display_name ?? row.item_name}": ${before.artifacts.length} → ${artifacts.length}`;

  if (input.dryRun) return { dryRun: true, diff: { before, after, human } };

  let eventId: number | undefined;
  db.transaction(() => {
    repo.replaceContainerFill(
      db,
      id,
      artifacts.map((artifact) => ({ itemId: artifact.itemId, level: artifact.level, quality: artifact.quality })),
      asOf,
    );
    eventId = repo.logEvent(db, {
      actor: 'owner',
      action: 'container.fill',
      entity: 'container',
      entityId: id,
      before,
      after,
    });
  })();
  return { dryRun: false, diff: { before, after, human }, eventId };
}

/* ------------------------------ builds ------------------------------ */

function buildSnapshot(db: Db, slug: string) {
  const build = repo.getBuild(db, slug);
  if (!build) return null;
  return {
    slug: build.slug,
    title: build.title,
    short: build.short,
    tag: build.tag,
    goal: build.goal,
    containerItemId: build.container_item_id,
    slots: build.slots,
    eff: build.eff,
    budget: build.budget,
    total: build.total,
    metrics: parseJson(build.metrics),
    verdict: build.verdict,
    position: build.position,
    rows: repo.listBuildSlots(db, build.id).map((slot: BuildSlotRow) => ({
      itemId: slot.item_id,
      label: slot.label,
      quality: slot.quality,
      rank: slot.rank,
      price: slot.price,
      lots: slot.lots,
      eff: slot.eff,
      bonus: slot.bonus,
      minus: slot.minus,
      why: slot.why,
    })),
  };
}

export function saveBuild(db: Db, input: BuildInputPayload): WriteResult {
  const existing = buildSnapshot(db, input.slug);
  const container = input.container ? resolveItem(db, input.container, 'container') : null;
  const rows = input.rows.map((row) => {
    const item = resolveOptionalItem(db, row.name ?? row.label ?? null);
    return {
      itemId: item?.id ?? null,
      label: row.name ?? row.label ?? null,
      quality: row.quality ?? null,
      rank: row.rank ?? null,
      price: row.price ?? null,
      lots: row.lots ?? null,
      eff: row.eff ?? null,
      bonus: row.bonus ?? null,
      minus: row.minus ?? null,
      why: row.why ?? null,
    };
  });
  const after = {
    slug: input.slug,
    title: input.title,
    short: input.short ?? null,
    tag: input.tag ?? null,
    goal: input.goal ?? null,
    containerItemId: container?.id ?? null,
    slots: input.slots ?? null,
    eff: input.eff ?? null,
    budget: input.budget ?? null,
    total: input.total ?? null,
    metrics: input.metrics ?? null,
    verdict: input.verdict ?? null,
    position: existing?.position ?? repo.listBuilds(db).length,
    rows,
  };
  const human = existing ? `Build "${input.title}" updated` : `Build "${input.title}" created`;

  if (input.dryRun) return { dryRun: true, diff: { before: existing, after, human } };

  let eventId: number | undefined;
  db.transaction(() => {
    repo.saveBuild(db, { ...after, position: after.position });
    eventId = repo.logEvent(db, {
      actor: 'owner',
      action: 'build.save',
      entity: 'build',
      entityId: input.slug,
      before: existing,
      after,
    });
  })();
  return { dryRun: false, diff: { before: existing, after, human }, eventId };
}

export function deleteBuild(db: Db, slug: string, dryRun: boolean): WriteResult {
  const before = buildSnapshot(db, slug);
  if (!before) throw new WriteError(404, 'BUILD_NOT_FOUND', 'Build not found');
  const human = `Build "${before.title}" deleted`;

  if (dryRun) return { dryRun: true, diff: { before, after: null, human } };

  let eventId: number | undefined;
  db.transaction(() => {
    repo.deleteBuild(db, slug);
    eventId = repo.logEvent(db, {
      actor: 'owner',
      action: 'build.delete',
      entity: 'build',
      entityId: slug,
      before,
      after: null,
    });
  })();
  return { dryRun: false, diff: { before, after: null, human }, eventId };
}

/* ------------------------------ content ------------------------------ */

function blockSnapshot(row: ContentBlockRow | null) {
  if (!row) return null;
  return {
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    lead: row.lead,
    payload: repo.blockPayload(row),
    position: row.position,
  };
}

export function putContentBlock(db: Db, input: ContentBlockInput): WriteResult {
  const before = blockSnapshot(repo.getBlock(db, input.kind, input.slug ?? null));
  const after = {
    kind: input.kind,
    slug: input.slug ?? null,
    title: input.title ?? null,
    lead: input.lead ?? null,
    payload: input.payload,
    position: input.position,
  };
  const human = before
    ? `Block ${input.kind}/${input.slug ?? '—'} updated`
    : `Block ${input.kind}/${input.slug ?? '—'} created`;

  if (input.dryRun) return { dryRun: true, diff: { before, after, human } };

  let eventId: number | undefined;
  db.transaction(() => {
    repo.putBlock(db, after);
    eventId = repo.logEvent(db, {
      actor: 'owner',
      action: 'content.put',
      entity: 'content',
      entityId: `${input.kind}:${input.slug ?? ''}`,
      before,
      after,
    });
  })();
  return { dryRun: false, diff: { before, after, human }, eventId };
}

/* ------------------------------ cleanup ------------------------------ */

function ownedCleanupSnapshot(db: Db, row: ReturnType<typeof repo.listOwned>[number]) {
  const snapshot: Record<string, unknown> = ownedSnapshot(row, row.item_name);
  if (row.kind === 'container') snapshot.fill = containerFillSnapshot(db, row.id);
  return snapshot;
}

export function clearOwned(db: Db, dryRun: boolean): WriteResult {
  const character = characterOrThrow(db);
  const rows = repo.listOwned(db, character.id);
  if (!rows.length) throw new WriteError(409, 'NOTHING_TO_CLEAR', 'Nothing to clear');

  const before = rows.map((row) => ownedCleanupSnapshot(db, row));
  const copies = rows.reduce((sum, row) => sum + row.qty, 0);
  const human = `Inventory cleared: ${rows.length} records, ${copies} copies`;

  if (dryRun) return { dryRun: true, diff: { before, after: null, human } };

  let eventId: number | undefined;
  db.transaction(() => {
    for (const row of rows) repo.deleteOwned(db, row.id);
    eventId = repo.logEvent(db, {
      actor: 'owner',
      action: 'owned.clear',
      entity: 'owned',
      entityId: 'all',
      before,
      after: null,
    });
  })();
  return { dryRun: false, diff: { before, after: null, human }, eventId };
}

export function clearBuilds(db: Db, dryRun: boolean): WriteResult {
  const builds = repo.listBuilds(db);
  if (!builds.length) throw new WriteError(409, 'NOTHING_TO_CLEAR', 'Nothing to clear');

  const before = builds.map((build) => buildSnapshot(db, build.slug)).filter(Boolean);
  const human = `Builds cleared: ${builds.length}`;

  if (dryRun) return { dryRun: true, diff: { before, after: null, human } };

  let eventId: number | undefined;
  db.transaction(() => {
    for (const build of builds) repo.deleteBuild(db, build.slug);
    eventId = repo.logEvent(db, {
      actor: 'owner',
      action: 'build.clear',
      entity: 'build',
      entityId: 'all',
      before,
      after: null,
    });
  })();
  return { dryRun: false, diff: { before, after: null, human }, eventId };
}

export function clearAll(db: Db, dryRun: boolean): WriteResult {
  const character = repo.getCharacter(db);
  const ownedRows = character ? repo.listOwned(db, character.id) : [];
  const builds = repo.listBuilds(db);
  if (!ownedRows.length && !builds.length) throw new WriteError(409, 'NOTHING_TO_CLEAR', 'Nothing to clear');

  const before = {
    owned: ownedRows.map((row) => ownedCleanupSnapshot(db, row)),
    builds: builds.map((build) => buildSnapshot(db, build.slug)).filter(Boolean),
  };
  const human = `All data cleared: ${ownedRows.length} inventory records, ${builds.length} builds`;

  if (dryRun) return { dryRun: true, diff: { before, after: null, human } };

  let eventId: number | undefined;
  db.transaction(() => {
    for (const row of ownedRows) repo.deleteOwned(db, row.id);
    for (const build of builds) repo.deleteBuild(db, build.slug);
    eventId = repo.logEvent(db, {
      actor: 'owner',
      action: 'dossier.clear',
      entity: 'dossier',
      entityId: 'all',
      before,
      after: null,
    });
  })();
  return { dryRun: false, diff: { before, after: null, human }, eventId };
}

/* ------------------------------ rollback ------------------------------ */

export function rollbackEvent(db: Db, eventId: number, dryRun: boolean): WriteResult {
  const event = repo.getEvent(db, eventId);
  if (!event) throw new WriteError(404, 'EVENT_NOT_FOUND', 'Event not found');

  const before = parseJson(event.after);
  const after = parseJson(event.before);
  const human = `Rollback of event #${eventId} (${event.action})`;

  if (dryRun) return { dryRun: true, diff: { before, after, human } };

  let rollbackId: number | undefined;
  db.transaction(() => {
    restoreSnapshot(db, event.action, after as never, before as never);
    rollbackId = repo.logEvent(db, {
      actor: 'owner',
      action: 'rollback',
      entity: 'event',
      entityId: event.id,
      before,
      after,
      note: `Rollback of ${event.action}`,
    });
  })();
  return { dryRun: false, diff: { before, after, human }, eventId: rollbackId };
}

function restoreSnapshot(db: Db, action: string, before: any, after: any): void {
  switch (action) {
    case 'owned.create': {
      if (before) repo.updateOwnedById(db, before.id, ownedPatch(before));
      else if (after?.id) repo.deleteOwned(db, after.id);
      return;
    }
    case 'owned.update': {
      if (before?.id) repo.updateOwnedById(db, before.id, ownedPatch(before));
      return;
    }
    case 'owned.delete': {
      restoreOwnedSnapshot(db, before);
      return;
    }
    case 'owned.clear': {
      for (const snapshot of (before as any[]) ?? []) restoreOwnedSnapshot(db, snapshot);
      return;
    }
    case 'build.clear': {
      for (const snapshot of (before as any[]) ?? []) if (snapshot) repo.saveBuild(db, snapshot);
      return;
    }
    case 'dossier.clear': {
      for (const snapshot of (before?.owned as any[]) ?? []) restoreOwnedSnapshot(db, snapshot);
      for (const snapshot of (before?.builds as any[]) ?? []) if (snapshot) repo.saveBuild(db, snapshot);
      return;
    }
    case 'container.fill': {
      if (before) {
        if (!repo.getOwned(db, before.ownedId)) {
          throw new WriteError(409, 'OWNED_NOT_FOUND', 'Container to roll back not found');
        }
        repo.replaceContainerFill(
          db,
          before.ownedId,
          (before.artifacts ?? []).map((artifact: any) => ({
            itemId: artifact.itemId,
            level: artifact.level,
            quality: artifact.quality,
          })),
          before.asOf ?? new Date().toISOString(),
        );
      }
      return;
    }
    case 'build.save': {
      if (before) repo.saveBuild(db, before);
      else if (after?.slug) repo.deleteBuild(db, after.slug);
      return;
    }
    case 'build.delete': {
      if (before) repo.saveBuild(db, before);
      return;
    }
    case 'content.put': {
      if (before) repo.putBlock(db, before);
      else if (after) repo.deleteBlock(db, after.kind, after.slug ?? null);
      return;
    }
    case 'character.update': {
      if (before) repo.updateCharacterById(db, before.id ?? characterOrThrow(db).id, before);
      return;
    }
    default:
      throw new WriteError(400, 'NOT_ROLLBACKABLE', `Event "${action}" cannot be rolled back`);
  }
}

function restoreOwnedSnapshot(db: Db, snapshot: any): void {
  if (!snapshot) return;
  const restoredId = repo.upsertOwned(db, {
    characterId: characterOrThrow(db).id,
    itemId: snapshot.itemId,
    kind: snapshot.kind,
    level: snapshot.level,
    quality: snapshot.quality,
    skinItemId: snapshot.skinItemId,
    qty: snapshot.qty,
    note: snapshot.note,
    role: snapshot.role,
    slot: snapshot.slot,
    displayName: snapshot.name,
    extra: snapshot.extra ?? undefined,
  });
  const fill = snapshot.fill as { asOf?: string | null; artifacts?: any[] } | null | undefined;
  if (fill?.artifacts?.length) {
    repo.replaceContainerFill(
      db,
      restoredId,
      fill.artifacts.map((artifact) => ({
        itemId: artifact.itemId,
        level: artifact.level,
        quality: artifact.quality,
      })),
      fill.asOf ?? new Date().toISOString(),
    );
  }
}

function ownedPatch(snapshot: any) {
  return {
    level: snapshot.level,
    quality: snapshot.quality,
    skin_item_id: snapshot.skinItemId,
    qty: snapshot.qty,
    note: snapshot.note,
    role: snapshot.role,
    slot: snapshot.slot,
    display_name: snapshot.name,
    extra: typeof snapshot.extra === 'string' ? snapshot.extra : snapshot.extra == null ? null : JSON.stringify(snapshot.extra),
  };
}
