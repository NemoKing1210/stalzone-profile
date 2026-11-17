import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@profile/core';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
const FACTIONS = ['rise', 'frontier', 'mercenaries', 'covenant'];

let dir: string;
let legacyDir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-faction-'));
  legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-legacy-'));
  fs.copyFileSync(path.join(migrationsDir, '0001_init.sql'), path.join(legacyDir, '0001_init.sql'));
  db = openDb(path.join(dir, 'test.db'));
  // Start from the pre-change schema so the new migration has data to convert.
  migrate(db, legacyDir);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(legacyDir, { recursive: true, force: true });
});

function columns(table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name);
}

describe('character faction migration', () => {
  it('drops the playstyle column and keeps the rest of the row', () => {
    db.prepare(
      `INSERT INTO character (nick, region, faction, clan_name, playstyle, created_at, updated_at)
       VALUES ('Legacy', 'ru', 'Заря', 'Old Clan', 'sniper', '2026-01-01', '2026-01-01')`,
    ).run();

    migrate(db, migrationsDir);

    expect(columns('character')).not.toContain('playstyle');
    expect(db.prepare(`SELECT nick, clan_name, faction FROM character`).get()).toEqual({
      nick: 'Legacy',
      clan_name: 'Old Clan',
      faction: null,
    });
  });

  it('rejects a faction outside the four game values on insert and update', () => {
    migrate(db, migrationsDir);

    expect(() =>
      db
        .prepare(
          `INSERT INTO character (nick, region, faction, created_at, updated_at)
           VALUES ('Bad', 'ru', 'stalkers', '2026-01-01', '2026-01-01')`,
        )
        .run(),
    ).toThrow(/faction/);

    db.prepare(
      `INSERT INTO character (nick, region, faction, created_at, updated_at)
       VALUES ('Good', 'ru', 'rise', '2026-01-01', '2026-01-01')`,
    ).run();
    for (const faction of FACTIONS) {
      db.prepare(`UPDATE character SET faction = ? WHERE nick = 'Good'`).run(faction);
    }
    expect(() => db.prepare(`UPDATE character SET faction = 'Сталкеры' WHERE nick = 'Good'`).run()).toThrow(/faction/);
    expect(() => db.prepare(`UPDATE character SET faction = NULL WHERE nick = 'Good'`).run()).not.toThrow();
  });
});
