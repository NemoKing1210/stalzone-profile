import { norm } from '@dossier/shared';
import type {
  BuildInput as BuildInputPayload,
  CharacterPatch,
  ContainerFill,
  OwnedCreate,
  OwnedPatch,
} from '@dossier/shared';
import type { Db } from '../db/index.js';
import * as repo from '../repo/index.js';
import type { CharacterColumnPatch, CharacterRow, OwnedJoined } from '../repo/index.js';

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
  if (!character) throw new WriteError(409, 'NO_CHARACTER', 'No character in the dossier — run onboarding first');
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

/* ------------------------------ snapshots ------------------------------ */

interface ContainerSnapshot {
  containerType: string | null;
  shield: number | null;
  bonus: string | null;
  protection: number | null;
  slots: number | null;
  eff: number | null;
}

type ContainerPatch = Partial<ContainerSnapshot>;

function containerSnapshot(db: Db, ownedId: number): ContainerSnapshot | null {
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

function mergeContainer(current: ContainerSnapshot | null, patch: ContainerPatch | null | undefined): ContainerSnapshot | null {
  if (patch === undefined) return current;
  if (patch === null) return null;
  return {
    containerType: patch.containerType ?? current?.containerType ?? null,
    shield: patch.shield ?? current?.shield ?? null,
    bonus: patch.bonus ?? current?.bonus ?? null,
    protection: patch.protection ?? current?.protection ?? null,
    slots: patch.slots ?? current?.slots ?? null,
    eff: patch.eff ?? current?.eff ?? null,
  };
}

function fillSnapshot(db: Db, ownedId: number) {
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

function ownedSnapshot(db: Db, row: OwnedJoined) {
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
  ['region', 'region'],
  ['faction', 'faction'],
  ['alliance', 'alliance'],
  ['clanName', 'clan_name'],
  ['clanRank', 'clan_rank'],
  ['money', 'money'],
  ['maxMoney', 'max_money'],
  ['stash', 'stash'],
  ['playstyle', 'playstyle'],
] as const;

type CharacterSnapshot = {
  id: number;
  nick: string;
  region: string;
  faction: string | null;
  alliance: string | null;
  clanName: string | null;
  clanRank: string | null;
  money: number | null;
  maxMoney: number | null;
  stash: string | null;
  playstyle: string | null;
  stats: Record<string, number | string>;
  manualStats: string[];
};

function characterSnapshot(db: Db, row: CharacterRow): CharacterSnapshot {
  const effective = repo.characterStatMap(db, row.id);
  const stats: Record<string, number | string> = {};
  const manualStats: string[] = [];
  for (const [statId, stat] of Object.entries(effective)) {
    const value = stat.value_num ?? stat.value_text;
    if (value == null) continue;
    stats[statId] = value;
    if (stat.origin === 'manual') manualStats.push(statId);
  }
  return {
    id: row.id,
    nick: row.nick,
    region: row.region,
    faction: row.faction,
    alliance: row.alliance,
    clanName: row.clan_name,
    clanRank: row.clan_rank,
    money: row.money,
    maxMoney: row.max_money,
    stash: row.stash,
    playstyle: row.playstyle,
    stats,
    manualStats: manualStats.sort(),
  };
}

function characterColumns(snapshot: Partial<CharacterSnapshot>): CharacterColumnPatch {
  const out: CharacterColumnPatch = {};
  for (const [key, column] of CHARACTER_FIELDS) {
    if (snapshot[key] !== undefined) out[column] = snapshot[key] as never;
  }
  return out;
}

export function patchCharacter(db: Db, patch: CharacterPatch): WriteResult {
  const character = characterOrThrow(db);
  const before = characterSnapshot(db, character);

  const defined: Partial<CharacterSnapshot> = {};
  for (const [key] of CHARACTER_FIELDS) {
    const value = patch[key as keyof CharacterPatch];
    if (value !== undefined) defined[key] = value as never;
  }

  const patchStats = patch.stats ?? {};
  const cleared = new Set(Object.entries(patchStats).filter(([, value]) => value === null).map(([statId]) => statId));
  const stats: Record<string, number | string> = {};
  for (const [statId, value] of Object.entries(before.stats)) {
    if (!cleared.has(statId)) stats[statId] = value;
  }
  const manual = new Set(before.manualStats);
  for (const [statId, value] of Object.entries(patchStats)) {
    if (value === null) {
      manual.delete(statId);
    } else {
      stats[statId] = value;
      manual.add(statId);
    }
  }

  const after: CharacterSnapshot = {
    ...before,
    ...defined,
    stats,
    manualStats: [...manual].sort(),
  };

  const changed: string[] = [];
  for (const [key] of CHARACTER_FIELDS) {
    if (before[key] !== after[key]) changed.push(`${key} ${String(before[key])} → ${String(after[key])}`);
  }
  if (JSON.stringify(before.stats) !== JSON.stringify(after.stats)) changed.push('stats');
  const human = changed.length ? `Character: ${changed.join(', ')}` : 'No changes';

  if (patch.dryRun) return { dryRun: true, diff: { before, after, human } };

  let eventId: number | undefined;
  db.transaction(() => {
    if (Object.keys(defined).length) repo.updateCharacterById(db, character.id, characterColumns(defined));
    for (const [statId, value] of Object.entries(patch.stats ?? {})) {
      if (value === null) repo.clearCharacterStat(db, character.id, statId, 'manual');
      else repo.setCharacterStat(db, character.id, statId, value, 'manual');
    }
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
      container: input.container ?? undefined,
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
      container:
        patch.container === undefined
          ? undefined
          : patch.container === null
            ? null
            : (patch.container as repo.ContainerInput),
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
  const before: Record<string, unknown> = { ...ownedSnapshot(db, row) };
  if (row.kind === 'container') before.fill = fillSnapshot(db, row.id);
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
  db.transaction(() => {
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
    verdict: build.verdict,
    position: build.position,
    metrics: repo.listBuildMetrics(db, build.id).map((metric) => ({
      l: metric.label,
      v: metric.value,
      s: metric.sub,
    })),
    rows: repo.listBuildSlots(db, build.id).map((slot) => ({
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
    metrics: input.metrics?.map((metric) => ({ l: metric.l, v: metric.v ?? null, s: metric.s ?? null })) ?? null,
    verdict: input.verdict ?? null,
    position: existing?.position ?? repo.listBuilds(db).length,
    rows,
  };
  const human = existing ? `Build "${input.title}" updated` : `Build "${input.title}" created`;

  if (input.dryRun) return { dryRun: true, diff: { before: existing, after, human } };

  let eventId: number | undefined;
  db.transaction(() => {
    repo.saveBuild(db, after);
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

/* ------------------------------ cleanup ------------------------------ */

function ownedCleanupSnapshot(db: Db, row: OwnedJoined) {
  const snapshot: Record<string, unknown> = ownedSnapshot(db, row);
  if (row.kind === 'container') snapshot.fill = fillSnapshot(db, row.id);
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
    restoreSnapshot(db, event.action, after, before);
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

function restoreSnapshot(
  db: Db,
  action: string,
  target: any /* the state recorded in event.before */,
  produced: any /* the state recorded in event.after */,
): void {
  switch (action) {
    case 'owned.create': {
      if (target) restoreOwnedSnapshot(db, target);
      else if (produced?.id) repo.deleteOwned(db, produced.id);
      return;
    }
    case 'owned.update': {
      if (target?.id) {
        repo.updateOwnedById(db, target.id, ownedPatch(target));
      }
      return;
    }
    case 'owned.delete': {
      restoreOwnedSnapshot(db, target);
      return;
    }
    case 'owned.clear': {
      for (const snapshot of (target as any[]) ?? []) restoreOwnedSnapshot(db, snapshot);
      return;
    }
    case 'build.clear': {
      for (const snapshot of (target as any[]) ?? []) if (snapshot) repo.saveBuild(db, snapshot);
      return;
    }
    case 'dossier.clear': {
      for (const snapshot of (target?.owned as any[]) ?? []) restoreOwnedSnapshot(db, snapshot);
      for (const snapshot of (target?.builds as any[]) ?? []) if (snapshot) repo.saveBuild(db, snapshot);
      return;
    }
    case 'container.fill': {
      if (target) {
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
      return;
    }
    case 'build.save': {
      if (target) repo.saveBuild(db, target);
      else if (produced?.slug) repo.deleteBuild(db, produced.slug);
      return;
    }
    case 'build.delete': {
      if (target) repo.saveBuild(db, target);
      return;
    }
    case 'character.update': {
      if (!target) return;
      const id = target.id ?? characterOrThrow(db).id;
      repo.updateCharacterById(db, id, characterColumns(target));
      restoreCharacterStats(db, id, target, produced);
      return;
    }
    default:
      throw new WriteError(400, 'NOT_ROLLBACKABLE', `Event "${action}" cannot be rolled back`);
  }
}

function restoreCharacterStats(db: Db, characterId: number, target: any, produced: any): void {
  const values = (target?.stats ?? {}) as Record<string, number | string>;
  const manual = new Set((target?.manualStats ?? []) as string[]);
  const current = repo.characterStatMap(db, characterId);
  const keys = new Set([...Object.keys(values), ...Object.keys(current), ...Object.keys(produced?.stats ?? {})]);
  for (const statId of keys) {
    if (statId in values && manual.has(statId)) repo.setCharacterStat(db, characterId, statId, values[statId]!, 'manual');
    else repo.clearCharacterStat(db, characterId, statId, 'manual');
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
    displayName: snapshot.displayName ?? snapshot.name,
  });
  if (snapshot.container) repo.upsertOwnedContainer(db, restoredId, snapshot.container);
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

function ownedPatch(snapshot: any): repo.OwnedPatch {
  return {
    level: snapshot.level,
    quality: snapshot.quality,
    skin_item_id: snapshot.skinItemId ?? null,
    qty: snapshot.qty,
    note: snapshot.note,
    role: snapshot.role,
    slot: snapshot.slot,
    display_name: snapshot.displayName ?? snapshot.name ?? null,
    container: snapshot.container ? { ...snapshot.container } : null,
  };
}
