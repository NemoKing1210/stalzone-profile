import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@dossier/core';
import * as repo from '@dossier/core';
import * as seed from '@dossier/core/testing';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-character-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  repo.ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('characters and character stats', () => {
  it('stores identity columns without derived stat columns', () => {
    const id = seed.upsertCharacter(db, {
      nick: 'tester',
      region: 'eu',
      faction: 'Заря',
      clanName: 'Клан',
      clanRank: 'Лидер',
      money: 1000,
    });
    expect(repo.getCharacter(db, id)).toMatchObject({
      nick: 'tester',
      region: 'eu',
      clan_name: 'Клан',
      clan_rank: 'Лидер',
      money: 1000,
      profile_fetched_at: null,
    });
    expect(repo.findCharacterByName(db, 'tester', 'eu')?.id).toBe(id);
    expect(repo.findCharacterByName(db, 'tester', 'ru')).toBeNull();
  });

  it('rejects an unknown region', () => {
    expect(() => seed.upsertCharacter(db, { nick: 'x', region: 'moon' })).toThrow(/CHECK/);
  });

  it('keeps API and manual values side by side; manual wins in the map', () => {
    const id = seed.upsertCharacter(db, { nick: 'tester', region: 'ru' });
    seed.setCharacterStat(db, id, 'kil', 250, 'api', '2026-01-01T00:00:00.000Z');
    seed.setCharacterStat(db, id, 'kil', 300, 'manual', '2026-01-02T00:00:00.000Z');
    seed.setCharacterStat(db, id, 'reg-tim', '2024-06-01', 'api');
    expect(repo.listCharacterStats(db, id)).toHaveLength(3);
    expect(repo.characterStatMap(db, id)).toMatchObject({
      kil: { value_num: 300, value_text: null, origin: 'manual' },
      'reg-tim': { value_num: null, value_text: '2024-06-01', origin: 'api' },
    });
    seed.clearCharacterStat(db, id, 'kil', 'manual');
    expect(repo.characterStatMap(db, id).kil).toMatchObject({ value_num: 250, origin: 'api' });
  });

  it('creates a stat definition on demand and rejects an empty value', () => {
    const id = seed.upsertCharacter(db, { nick: 'tester', region: 'ru' });
    seed.setCharacterStat(db, id, 'custom-stat', 7, 'manual');
    expect(repo.getStatDefinition(db, 'custom-stat')?.value_type).toBe('INTEGER');
    seed.setCharacterStat(db, id, 'custom-text', 'abc', 'manual');
    expect(repo.getStatDefinition(db, 'custom-text')?.value_type).toBe('TEXT');
    expect(() => seed.setCharacterStat(db, id, 'empty', '', 'manual')).toThrow(/value/i);
  });
});
