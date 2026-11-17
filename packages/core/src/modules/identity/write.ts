import type { CharacterCreate, CharacterPatch, Faction } from '@profile/shared';
import type { Db } from '../../platform/db/index.js';
import { logEvent, withTransaction, WriteError, type WriteResult } from '../../platform/journal/index.js';
import * as repo from './repo/characters.js';
import type { CharacterColumnPatch, CharacterRow } from './repo/characters.js';

const CHARACTER_FIELDS = [
  ['nick', 'nick'],
  ['region', 'region'],
  ['faction', 'faction'],
  ['alliance', 'alliance'],
  ['clanName', 'clan_name'],
  ['clanRank', 'clan_rank'],
  ['money', 'money'],
  ['maxMoney', 'max_money'],
] as const;

export type CharacterSnapshot = {
  id: number;
  nick: string;
  region: string;
  faction: Faction | null;
  alliance: string | null;
  clanName: string | null;
  clanRank: string | null;
  money: number | null;
  maxMoney: number | null;
  stats: Record<string, number | string>;
  manualStats: string[];
};

export function characterOrThrow(db: Db): CharacterRow {
  const character = repo.getCharacter(db);
  if (!character) throw new WriteError(409, 'NO_CHARACTER', 'No character in the profile — run onboarding first');
  return character;
}

/** Whole character state, including every stat origin, for a lossless reset rollback. */
export interface CharacterDataSnapshot {
  character: {
    id: number;
    nick: string;
    region: string;
    faction: Faction | null;
    alliance: string | null;
    clanName: string | null;
    clanRank: string | null;
    money: number | null;
    maxMoney: number | null;
    profileFetchedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  stats: {
    statId: string;
    valueNum: number | null;
    valueText: string | null;
    origin: 'api' | 'manual';
    fetchedAt: string;
  }[];
}

export function characterDataSnapshot(db: Db, row: CharacterRow): CharacterDataSnapshot {
  return {
    character: {
      id: row.id,
      nick: row.nick,
      region: row.region,
      faction: row.faction,
      alliance: row.alliance,
      clanName: row.clan_name,
      clanRank: row.clan_rank,
      money: row.money,
      maxMoney: row.max_money,
      profileFetchedAt: row.profile_fetched_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    stats: repo.listCharacterStats(db, row.id).map((stat) => ({
      statId: stat.stat_id,
      valueNum: stat.value_num,
      valueText: stat.value_text,
      origin: stat.origin,
      fetchedAt: stat.fetched_at,
    })),
  };
}

/** Recreates a character with its original id and every stat row. Holds no transaction. */
export function restoreCharacterDataTx(db: Db, snapshot: CharacterDataSnapshot): void {
  if (!snapshot?.character) return;
  if (repo.getCharacter(db)) throw new WriteError(409, 'CHARACTER_EXISTS', 'A character already exists');

  repo.restoreCharacterRow(db, snapshot.character);
  for (const stat of snapshot.stats ?? []) {
    const value = stat.valueNum ?? stat.valueText;
    if (value == null) continue;
    repo.setCharacterStat(db, snapshot.character.id, stat.statId, value, stat.origin, stat.fetchedAt);
  }
  repo.setCharacterUpdatedAt(db, snapshot.character.id, snapshot.character.updatedAt);
}

export function characterSnapshot(db: Db, row: CharacterRow): CharacterSnapshot {
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

/** First-run creation. The profile holds at most one character. */
export function createCharacter(db: Db, input: CharacterCreate): WriteResult {
  if (repo.getCharacter(db)) throw new WriteError(409, 'CHARACTER_EXISTS', 'A character already exists');

  const preview: Omit<CharacterSnapshot, 'id'> = {
    nick: input.nick,
    region: input.region,
    faction: input.faction ?? null,
    alliance: input.alliance ?? null,
    clanName: input.clanName ?? null,
    clanRank: input.clanRank ?? null,
    money: null,
    maxMoney: null,
    stats: {},
    manualStats: [],
  };
  const human = `Create character "${input.nick}" (${input.region})`;

  if (input.dryRun) return { dryRun: true, diff: { before: null, after: preview, human } };

  let eventId: number | undefined;
  let after: CharacterSnapshot | undefined;
  withTransaction(db, () => {
    const id = repo.upsertCharacter(db, {
      nick: input.nick,
      region: input.region,
      faction: input.faction ?? null,
      alliance: input.alliance ?? null,
      clanName: input.clanName ?? null,
      clanRank: input.clanRank ?? null,
    });
    after = characterSnapshot(db, repo.getCharacter(db, id)!);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'character.create',
      entity: 'character',
      entityId: id,
      before: null,
      after,
    });
  });
  return { dryRun: false, diff: { before: null, after, human }, eventId };
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
  /** Only counters that actually become manual are written; an unchanged API value stays API-owned. */
  const statWrites: Record<string, number | string | null> = {};
  for (const [statId, value] of Object.entries(patchStats)) {
    if (value === null) {
      manual.delete(statId);
      statWrites[statId] = null;
      continue;
    }
    if (!manual.has(statId) && before.stats[statId] === value) continue;
    stats[statId] = value;
    manual.add(statId);
    statWrites[statId] = value;
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
  withTransaction(db, () => {
    if (Object.keys(defined).length) repo.updateCharacterById(db, character.id, characterColumns(defined));
    for (const [statId, value] of Object.entries(statWrites)) {
      if (value === null) repo.clearCharacterStat(db, character.id, statId, 'manual');
      else repo.setCharacterStat(db, character.id, statId, value, 'manual');
    }
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'character.update',
      entity: 'character',
      entityId: character.id,
      before,
      after,
    });
  });
  return { dryRun: false, diff: { before, after, human }, eventId };
}

/** Restores the `character.update` event state. Assumes the caller holds the transaction. */
export function restoreCharacterTx(db: Db, target: any, produced: any): void {
  if (!target) return;
  const id = target.id ?? characterOrThrow(db).id;
  repo.updateCharacterById(db, id, characterColumns(target));
  const values = (target?.stats ?? {}) as Record<string, number | string>;
  const manual = new Set((target?.manualStats ?? []) as string[]);
  const current = repo.characterStatMap(db, id);
  const keys = new Set([...Object.keys(values), ...Object.keys(current), ...Object.keys(produced?.stats ?? {})]);
  for (const statId of keys) {
    if (statId in values && manual.has(statId)) repo.setCharacterStat(db, id, statId, values[statId]!, 'manual');
    else repo.clearCharacterStat(db, id, statId, 'manual');
  }
}
