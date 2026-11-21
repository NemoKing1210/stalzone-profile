import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, openDb, migrate, tableExists, type Db } from '@profile/core';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-db-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('baseline schema', () => {
  it('creates every table in the new baseline', () => {
    const tables = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as { name: string }[]
    )
      .map((row) => row.name)
      .filter((name) => !name.startsWith('sqlite_'));
    expect(tables).toEqual([
      '_migration',
      'character',
      'character_stat',
      'chat_attachment',
      'chat_message',
      'chat_prompt',
      'chat_prompt_active',
      'chat_settings',
      'chat_thread',
      'container_data',
      'event_log',
      'icon',
      'inventory_item',
      'item',
      'item_effect',
      'item_layout',
      'item_placement',
      'item_stat',
      'log_entry',
      'log_level',
      'log_setting',
      'modification_compat',
      'price_quote',
      'source',
      'stat_definition',
      'storage',
      'sync_schedule',
    ]);
  });

  it('drops the legacy derived tables and JSON-era columns', () => {
    for (const name of [
      'catalog_entry',
      'details_card',
      'content_block',
      'app_meta',
      'price_snapshot',
      'owned',
      'container_fill',
      'build',
      'build_metric',
      'build_slot',
    ]) {
      expect(tableExists(db, name)).toBe(false);
    }
    const itemColumns = (db.prepare(`PRAGMA table_info(item)`).all() as { name: string }[]).map((c) => c.name);
    expect(itemColumns).not.toContain('raw');
    expect(itemColumns).not.toContain('quality');
    expect(itemColumns).not.toContain('icon_path');
    const characterColumns = (db.prepare(`PRAGMA table_info(character)`).all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(characterColumns).not.toContain('stats');
    expect(characterColumns).not.toContain('hours');
    expect(characterColumns).not.toContain('kd');
  });

  it('creates the instance inventory tables and drops the owned model', () => {
    for (const name of [
      'storage',
      'inventory_item',
      'item_placement',
      'container_data',
      'modification_compat',
      'item_layout',
    ]) {
      expect(tableExists(db, name)).toBe(true);
    }
    for (const name of ['owned_item', 'owned_container', 'container_slot']) {
      expect(tableExists(db, name)).toBe(false);
    }
    const itemColumns = (db.prepare(`PRAGMA table_info(item)`).all() as { name: string }[]).map((c) => c.name);
    expect(itemColumns).toContain('name_key');
    const characterColumns = (db.prepare(`PRAGMA table_info(character)`).all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(characterColumns).not.toContain('stash');
  });

  it('rejects a placement whose character does not match its item', () => {
    const now = '2026-01-01T00:00:00.000Z';
    db.prepare(`INSERT INTO source (id, kind, updated_at) VALUES ('local', 'manual', ?)`).run(now);
    db.prepare(
      `INSERT INTO character (id, nick, region, created_at, updated_at) VALUES (1, 'One', 'ru', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO character (id, nick, region, created_at, updated_at) VALUES (2, 'Two', 'ru', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO item (id, source_id, external_id, name, name_norm, kind, created_at, updated_at)
       VALUES (1, 'local', 'w1', 'Rifle', 'rifle', 'weapon', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO inventory_item (id, character_id, item_id, kind, created_at, updated_at)
       VALUES (1, 1, 1, 'weapon', ?, ?)`,
    ).run(now, now);
    expect(() =>
      db
        .prepare(
          `INSERT INTO item_placement (item_id, character_id, location, updated_at)
           VALUES (1, 2, 'loose', ?)`,
        )
        .run(now),
    ).toThrow(/placement character mismatch/);
  });

  it('keeps the hot page cache and temp tables in memory', () => {
    expect(db.pragma('cache_size', { simple: true })).toBe(-64000);
    expect(db.pragma('temp_store', { simple: true })).toBe(2);
  });

  it('enables STRICT and foreign keys', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    for (const table of ['item', 'character', 'inventory_item', 'event_log']) {
      const sql = (
        db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table) as { sql: string }
      ).sql;
      expect(sql).toContain('STRICT');
    }
    expect(() =>
      db
        .prepare(
          `INSERT INTO item (source_id, external_id, name, name_norm, kind, created_at, updated_at) VALUES ('missing', 'x', 'X', 'x', 'weapon', 'now', 'now')`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it('keeps price_latest over price_quote', () => {
    db.prepare(`INSERT INTO source (id, kind, updated_at) VALUES ('scpmodel', 'market', '2026-01-01T00:00:00.000Z')`).run();
    db.prepare(
      `INSERT INTO price_quote (name, name_norm, quality, quality_norm, bonus, lot_price, source_id, fetched_at) VALUES ('АК-12', 'ак-12', 'Редкий', 'редкий', 0, 100, 'scpmodel', '2026-01-01T00:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO price_quote (name, name_norm, quality, quality_norm, bonus, lot_price, source_id, fetched_at) VALUES ('АК-12', 'ак-12', 'Редкий', 'редкий', 0, 200, 'scpmodel', '2026-01-02T00:00:00.000Z')`,
    ).run();
    const rows = db.prepare(`SELECT lot_price FROM price_latest WHERE name_norm = 'ак-12'`).all() as {
      lot_price: number;
    }[];
    expect(rows).toEqual([{ lot_price: 200 }]);
  });
});
