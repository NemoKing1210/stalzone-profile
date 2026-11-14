import type { Db } from '../db/index.js';

export interface CharacterRow {
  id: number;
  nick: string;
  realm: string;
  faction: string | null;
  alliance: string | null;
  clan: string | null;
  arrived: string | null;
  hours: number | null;
  kd: number | null;
  accuracy: number | null;
  headshot: number | null;
  achievements: number | null;
  achievement_points: number | null;
  money: number | null;
  max_money: number | null;
  stash: string | null;
  playstyle: string | null;
  stats: string | null;
  updated_at: string;
}

export interface CharacterInput {
  nick: string;
  realm: string;
  faction?: string | null;
  alliance?: string | null;
  clan?: string | null;
  arrived?: string | null;
  hours?: number | null;
  kd?: number | null;
  accuracy?: number | null;
  headshot?: number | null;
  achievements?: number | null;
  achievementPoints?: number | null;
  money?: number | null;
  maxMoney?: number | null;
  stash?: string | null;
  playstyle?: string | null;
  stats?: unknown;
}

const FIELDS = [
  'faction',
  'alliance',
  'clan',
  'arrived',
  'hours',
  'kd',
  'accuracy',
  'headshot',
  'achievements',
  'achievement_points',
  'money',
  'max_money',
  'stash',
  'playstyle',
] as const;

export function upsertCharacter(db: Db, input: CharacterInput): number {
  const existing = db
    .prepare(`SELECT id FROM character WHERE nick = ? AND realm = ?`)
    .get(input.nick, input.realm) as { id: number } | undefined;

  const values: Record<string, unknown> = {
    faction: input.faction ?? null,
    alliance: input.alliance ?? null,
    clan: input.clan ?? null,
    arrived: input.arrived ?? null,
    hours: input.hours ?? null,
    kd: input.kd ?? null,
    accuracy: input.accuracy ?? null,
    headshot: input.headshot ?? null,
    achievements: input.achievements ?? null,
    achievement_points: input.achievementPoints ?? null,
    money: input.money ?? null,
    max_money: input.maxMoney ?? null,
    stash: input.stash ?? null,
    playstyle: input.playstyle ?? null,
  };
  const stats = input.stats === undefined ? null : JSON.stringify(input.stats);
  const now = new Date().toISOString();

  if (existing) {
    const sets = FIELDS.map((f) => `${f} = @${f}`).join(', ');
    db.prepare(
      `UPDATE character SET ${sets}, stats = COALESCE(@stats, stats), updated_at = @updated_at WHERE id = @id`,
    ).run({ ...values, stats, updated_at: now, id: existing.id });
    return existing.id;
  }

  const cols = ['nick', 'realm', ...FIELDS, 'stats', 'updated_at'];
  const placeholders = cols.map((c) => `@${c}`).join(', ');
  const info = db
    .prepare(`INSERT INTO character (${cols.join(', ')}) VALUES (${placeholders})`)
    .run({ nick: input.nick, realm: input.realm, ...values, stats, updated_at: now });
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

export function characterStats(db: Db, id: number): Record<string, unknown> {
  const row = getCharacter(db, id);
  if (!row?.stats) return {};
  try {
    return JSON.parse(row.stats) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function mergeCharacterStats(db: Db, id: number, patch: Record<string, unknown>): void {
  const current = characterStats(db, id);
  const merged = { ...current, ...patch };
  db.prepare(`UPDATE character SET stats = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(merged),
    new Date().toISOString(),
    id,
  );
}

export function findCharacterByName(db: Db, nick: string, realm = 'ru'): CharacterRow | null {
  return (
    (db.prepare(`SELECT * FROM character WHERE nick = ? AND realm = ?`).get(nick, realm) as
      | CharacterRow
      | undefined) ?? null
  );
}
