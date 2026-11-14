import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, openDb, migrate, tableExists, type Db } from '@dossier/core';
import * as repo from '@dossier/core';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-db-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  repo.ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

function character(): number {
  return repo.upsertCharacter(db, { nick: 'tester', realm: 'ru' });
}

function item(name: string, kind = 'artifact'): number {
  return repo.upsertItem(db, {
    sourceId: 'local',
    exboId: `test:${name}`,
    name,
    kind,
  });
}

describe('migration 0002', () => {
  it('adds owned qty/display_name and the catalog/details tables', () => {
    const columns = db.prepare(`PRAGMA table_info(owned)`).all() as { name: string }[];
    expect(columns.map((c) => c.name)).toEqual(expect.arrayContaining(['qty', 'display_name']));
    expect(tableExists(db, 'catalog_entry')).toBe(true);
    expect(tableExists(db, 'details_card')).toBe(true);

    const index = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'owned_unique'`)
      .get() as { sql: string };
    expect(index.sql).toContain('quality');
    expect(index.sql).toContain('COALESCE');
  });
});

describe('owned copies', () => {
  it('stores identical copies as one row with qty', () => {
    const characterId = character();
    const itemId = item('Нервяк');
    repo.upsertOwned(db, { characterId, itemId, kind: 'artifact', level: 15, qty: 2, displayName: 'Нервяк' });

    const rows = repo.listOwned(db, characterId, 'artifact');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qty: 2, level: 15, display_name: 'Нервяк' });
  });

  it('sets qty on repeat instead of duplicating the row', () => {
    const characterId = character();
    const itemId = item('Нервяк');
    repo.upsertOwned(db, { characterId, itemId, kind: 'artifact', level: 15, qty: 2 });
    repo.upsertOwned(db, { characterId, itemId, kind: 'artifact', level: 15, qty: 3 });

    const rows = repo.listOwned(db, characterId, 'artifact');
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(3);
  });

  it('keeps artifacts with different quality apart', () => {
    const characterId = character();
    const itemId = item('Корка');
    repo.upsertOwned(db, { characterId, itemId, kind: 'artifact', level: 5, quality: 'Редкий 141,18%' });
    repo.upsertOwned(db, { characterId, itemId, kind: 'artifact', level: 5, quality: 'Редкий 138,61%' });

    const rows = repo.listOwned(db, characterId, 'artifact');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.quality).sort()).toEqual(['Редкий 138,61%', 'Редкий 141,18%']);
  });
});

describe('catalog entries', () => {
  it('preserves duplicate names and positions', () => {
    repo.insertCatalogEntries(db, 'armor', [
      { name: 'Куртка с бронежилетом', data: { armor15: 46 } },
      { name: 'Куртка с бронежилетом', data: { armor15: 46 } },
      { name: 'Бандитский кожак', data: { armor15: 38 } },
    ]);

    const rows = repo.listCatalogEntries(db, 'armor');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.name)).toEqual(['Куртка с бронежилетом', 'Куртка с бронежилетом', 'Бандитский кожак']);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(JSON.parse(rows[2].data)).toEqual({ armor15: 38 });
  });

  it('replaces the previous snapshot for the kind', () => {
    repo.insertCatalogEntries(db, 'armor', [{ name: 'A', data: {} }, { name: 'B', data: {} }]);
    repo.insertCatalogEntries(db, 'armor', [{ name: 'C', data: {} }]);
    expect(repo.listCatalogEntries(db, 'armor').map((r) => r.name)).toEqual(['C']);
  });
});

describe('details cards', () => {
  it('round-trips exact legacy keys', () => {
    const itemId = item('Болотный глинец');
    repo.upsertDetailsCard(db, {
      key: 'art:Болотный Глинец',
      itemId,
      kind: 'artifact',
      name: 'Болотный глинец',
      data: { kind: 'artifact', name: 'Болотный глинец', stats: [] },
    });

    const card = repo.getDetailsCard(db, 'art:Болотный Глинец');
    expect(card?.key).toBe('art:Болотный Глинец');
    expect(JSON.parse(card!.data)).toMatchObject({ name: 'Болотный глинец' });
    expect(repo.listDetailsCards(db)).toHaveLength(1);
  });

  it('updates a card in place', () => {
    repo.upsertDetailsCard(db, { key: 'w:АК-12', kind: 'weapon', name: 'АК-12', data: { v: 1 } });
    repo.upsertDetailsCard(db, {
      key: 'w:АК-12',
      kind: 'weapon',
      name: 'АК-12',
      data: { v: 2 },
      itemId: item('АК-12', 'weapon'),
    });
    const rows = repo.listDetailsCards(db);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].data)).toEqual({ v: 2 });
    expect(rows[0].item_id).not.toBeNull();
  });
});
