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
  if (!character) throw new WriteError(409, 'NO_CHARACTER', 'В базе нет персонажа — сначала импортируйте досье');
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
    throw new WriteError(422, 'UNKNOWN_ITEM', `Предмет «${name}» не найден`, {
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
    ? `Персонаж: ${changed.map((key) => `${key} ${String(before[key])} → ${String(after[key])}`).join(', ')}`
    : 'Без изменений';

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
  const skinItemId = input.skin ? resolveItem(db, input.skin, 'motif').id : null;
  const quality = input.quality ?? null;
  const existing = repo.findOwned(db, character.id, item.id, input.level, quality, skinItemId);
  const qty = (existing?.qty ?? 0) + input.qty;
  const before = existing ? ownedSnapshot(existing, item.name) : null;
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
  };
  const human = existing
    ? `Количество «${item.name}»: ${existing.qty} → ${qty}`
    : `Добавлено «${item.name}» ×${qty}`;

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
  if (!row) throw new WriteError(404, 'OWNED_NOT_FOUND', 'Запись не найдена');

  const skinItemId =
    patch.skin === undefined ? row.skin_item_id : patch.skin === null ? null : resolveItem(db, patch.skin, 'motif').id;
  const merged = {
    level: patch.level ?? row.level,
    quality: patch.quality === undefined ? row.quality : patch.quality,
    note: patch.note === undefined ? row.note : patch.note,
    role: patch.role === undefined ? row.role : patch.role,
    slot: patch.slot === undefined ? row.slot : patch.slot,
    qty: patch.qty ?? row.qty,
    displayName: patch.displayName === undefined ? row.display_name : patch.displayName,
    skinItemId,
  };

  const clash = repo.findOwned(db, row.character_id, row.item_id, merged.level, merged.quality, merged.skinItemId);
  if (clash && clash.id !== row.id) {
    throw new WriteError(409, 'OWNED_CONFLICT', 'Такая запись уже существует — измените количество в ней', {
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
  if (before.skinItemId !== after.skinItemId) changes.push('skin: изменён');
  const human = changes.length ? `«${row.display_name ?? row.item_name}»: ${changes.join(', ')}` : 'Без изменений';

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
  if (!row) throw new WriteError(404, 'OWNED_NOT_FOUND', 'Запись не найдена');

  const remove = Math.min(Math.max(1, Math.trunc(opts.qty ?? 1)), row.qty);
  const remaining = row.qty - remove;
  const before = ownedSnapshot(row);
  const after = remaining > 0 ? { ...before, qty: remaining } : null;
  const name = row.display_name ?? row.item_name;
  const human = remaining > 0 ? `Количество «${name}»: ${row.qty} → ${remaining}` : `Удалено «${name}»`;

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
  if (!row) throw new WriteError(404, 'OWNED_NOT_FOUND', 'Контейнер не найден');
  if (row.kind !== 'container') throw new WriteError(422, 'NOT_A_CONTAINER', 'Эта запись не является контейнером');

  const before = containerFillSnapshot(db, id);
  const artifacts = input.artifacts.map((artifact) => {
    const item = resolveItem(db, artifact.name, 'artifact');
    return { itemId: item.id, name: item.name, level: artifact.level, quality: artifact.quality ?? null };
  });
  const asOf = input.asOf ?? new Date().toISOString();
  const after = { ownedId: id, asOf, artifacts };
  const human = `Наполнение «${row.display_name ?? row.item_name}»: ${before.artifacts.length} → ${artifacts.length}`;

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
  const human = existing ? `Сборка «${input.title}» обновлена` : `Сборка «${input.title}» создана`;

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
  if (!before) throw new WriteError(404, 'BUILD_NOT_FOUND', 'Сборка не найдена');
  const human = `Удалена сборка «${before.title}»`;

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
    ? `Блок ${input.kind}/${input.slug ?? '—'} обновлён`
    : `Блок ${input.kind}/${input.slug ?? '—'} создан`;

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

/* ------------------------------ rollback ------------------------------ */

export function rollbackEvent(db: Db, eventId: number, dryRun: boolean): WriteResult {
  const event = repo.getEvent(db, eventId);
  if (!event) throw new WriteError(404, 'EVENT_NOT_FOUND', 'Событие не найдено');

  const before = parseJson(event.after);
  const after = parseJson(event.before);
  const human = `Откат события #${eventId} (${event.action})`;

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
      note: `Откат ${event.action}`,
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
      if (before) {
        repo.upsertOwned(db, {
          characterId: characterOrThrow(db).id,
          itemId: before.itemId,
          kind: before.kind,
          level: before.level,
          quality: before.quality,
          skinItemId: before.skinItemId,
          qty: before.qty,
          note: before.note,
          role: before.role,
          slot: before.slot,
          displayName: before.name,
        });
      }
      return;
    }
    case 'container.fill': {
      if (before) {
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
      throw new WriteError(400, 'NOT_ROLLBACKABLE', `Событие «${action}» нельзя откатить`);
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
  };
}
