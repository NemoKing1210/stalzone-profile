import type { Faction } from '@dossier/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import { upsertStatDefinition } from '../../catalog/index.js';

export type CharacterRegion = 'ru' | 'eu' | 'na' | 'sea' | 'global';
export type CharacterStatOrigin = 'api' | 'manual';

export interface CharacterRow {
  id: number;
  nick: string;
  region: string;
  faction: Faction | null;
  alliance: string | null;
  clan_name: string | null;
  clan_rank: string | null;
  money: number | null;
  max_money: number | null;
  stash: string | null;
  profile_fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterInput {
  nick: string;
  region: string;
  faction?: Faction | null;
  alliance?: string | null;
  clanName?: string | null;
  clanRank?: string | null;
  money?: number | null;
  maxMoney?: number | null;
  stash?: string | null;
  profileFetchedAt?: string | null;
}

export interface CharacterStat {
  stat_id: string;
  value_num: number | null;
  value_text: string | null;
  origin: CharacterStatOrigin;
  fetched_at: string;
}

export type CharacterStatRow = CharacterStat;

export type CharacterColumnPatch = Partial<
  Pick<
    CharacterRow,
    | 'nick'
    | 'region'
    | 'faction'
    | 'alliance'
    | 'clan_name'
    | 'clan_rank'
    | 'money'
    | 'max_money'
    | 'stash'
    | 'profile_fetched_at'
  >
>;

const IDENTITY_COLUMNS = [
  'faction',
  'alliance',
  'clan_name',
  'clan_rank',
  'money',
  'max_money',
  'stash',
  'profile_fetched_at',
] as const;

export function upsertCharacter(db: Db, input: CharacterInput): number {
  const existing = db
    .prepare(`SELECT id FROM character WHERE nick = ? AND region = ?`)
    .get(input.nick, input.region) as { id: number } | undefined;

  const values = {
    faction: input.faction ?? null,
    alliance: input.alliance ?? null,
    clan_name: input.clanName ?? null,
    clan_rank: input.clanRank ?? null,
    money: input.money ?? null,
    max_money: input.maxMoney ?? null,
    stash: input.stash ?? null,
    profile_fetched_at: input.profileFetchedAt ?? null,
  };
  const now = new Date().toISOString();

  if (existing) {
    const sets = IDENTITY_COLUMNS.map((column) => `${column} = COALESCE(@${column}, ${column})`).join(', ');
    db.prepare(`UPDATE character SET ${sets}, updated_at = @updated_at WHERE id = @id`).run({
      ...values,
      updated_at: now,
      id: existing.id,
    });
    return existing.id;
  }

  const info = db
    .prepare(
      `INSERT INTO character (nick, region, ${IDENTITY_COLUMNS.join(', ')}, created_at, updated_at)
       VALUES (@nick, @region, ${IDENTITY_COLUMNS.map((column) => '@' + column).join(', ')}, @created_at, @updated_at)`,
    )
    .run({ nick: input.nick, region: input.region, ...values, created_at: now, updated_at: now });
  return Number(info.lastInsertRowid);
}

export function getCharacter(db: Db, id?: number): CharacterRow | null {
  if (id != null) {
    return (db.prepare(`SELECT * FROM character WHERE id = ?`).get(id) as CharacterRow | undefined) ?? null;
  }
  return (db.prepare(`SELECT * FROM character ORDER BY id LIMIT 1`).get() as CharacterRow | undefined) ?? null;
}

export function listCharacters(db: Db): CharacterRow[] {
  return db.prepare(`SELECT * FROM character ORDER BY id`).all() as CharacterRow[];
}

export function findCharacterByName(db: Db, nick: string, region = 'ru'): CharacterRow | null {
  return (
    (db.prepare(`SELECT * FROM character WHERE nick = ? AND region = ?`).get(nick, region) as
      | CharacterRow
      | undefined) ?? null
  );
}

/** True when gear or builds exist; deleting the character would cascade-destroy them. */
export function characterHasDossier(db: Db, id: number): boolean {
  const row = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM owned_item WHERE character_id = @id) + (SELECT COUNT(*) FROM build) AS c`,
    )
    .get({ id }) as { c: number };
  return row.c > 0;
}

export function deleteCharacter(db: Db, id: number): void {
  db.prepare(`DELETE FROM character WHERE id = ?`).run(id);
}

export function updateCharacterById(db: Db, id: number, patch: CharacterColumnPatch): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, updated_at: new Date().toISOString() };
  for (const column of ['nick', 'region', ...IDENTITY_COLUMNS] as const) {
    if (patch[column] === undefined) continue;
    sets.push(`${column} = @${column}`);
    params[column] = patch[column];
  }
  if (!sets.length) return;
  db.prepare(`UPDATE character SET ${sets.join(', ')}, updated_at = @updated_at WHERE id = @id`).run(params);
}

export function listCharacterStats(db: Db, characterId: number): CharacterStat[] {
  return db
    .prepare(
      `SELECT stat_id, value_num, value_text, origin, fetched_at
       FROM character_stat WHERE character_id = ? ORDER BY stat_id, origin`,
    )
    .all(characterId) as CharacterStat[];
}

/** Effective stats: a manual row wins over the API row for the same stat. */
export function characterStatMap(db: Db, characterId: number): Record<string, CharacterStat> {
  const out: Record<string, CharacterStat> = {};
  for (const row of listCharacterStats(db, characterId)) {
    if (out[row.stat_id]?.origin === 'manual') continue;
    out[row.stat_id] = row;
  }
  return out;
}

export function setCharacterStat(
  db: Db,
  characterId: number,
  statId: string,
  value: number | string,
  origin: CharacterStatOrigin,
  fetchedAt = new Date().toISOString(),
): void {
  let valueNum: number | null = null;
  let valueText: string | null = null;
  let valueType: 'INTEGER' | 'DECIMAL' | 'TEXT';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('value must be a finite number or a non-empty string');
    valueNum = value;
    valueType = Number.isInteger(value) ? 'INTEGER' : 'DECIMAL';
  } else if (typeof value === 'string' && value.trim() !== '') {
    valueText = value;
    valueType = 'TEXT';
  } else {
    throw new Error('value must be a finite number or a non-empty string');
  }

  const run = db.transaction(() => {
    upsertStatDefinition(db, { id: statId, valueType });
    db.prepare(
      `INSERT INTO character_stat (character_id, stat_id, value_num, value_text, origin, fetched_at)
       VALUES (@character_id, @stat_id, @value_num, @value_text, @origin, @fetched_at)
       ON CONFLICT(character_id, stat_id, origin) DO UPDATE SET
         value_num = excluded.value_num, value_text = excluded.value_text, fetched_at = excluded.fetched_at`,
    ).run({
      character_id: characterId,
      stat_id: statId,
      value_num: valueNum,
      value_text: valueText,
      origin,
      fetched_at: fetchedAt,
    });
    db.prepare(`UPDATE character SET updated_at = ? WHERE id = ?`).run(fetchedAt, characterId);
  });
  run();
}

export function clearCharacterStat(
  db: Db,
  characterId: number,
  statId: string,
  origin: CharacterStatOrigin,
): void {
  db.prepare(`DELETE FROM character_stat WHERE character_id = ? AND stat_id = ? AND origin = ?`).run(
    characterId,
    statId,
    origin,
  );
  db.prepare(`UPDATE character SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), characterId);
}
