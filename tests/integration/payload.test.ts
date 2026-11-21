import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPayload, closeDb, exportProfileJson, migrate, openDb, type Db } from '@profile/core';
import * as seed from '@profile/core/testing';
import { seedCatalog } from '../fixtures/seed';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

let dir: string;
let db: Db;
let payload: ReturnType<typeof buildPayload>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-payload-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  seedCatalog(db);
  payload = buildPayload(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('buildPayload contract', () => {
  it('returns exactly the new sections', () => {
    expect(Object.keys(payload).sort()).toEqual([
      'armor',
      'artifacts',
      'catalog',
      'character',
      'containers',
      'freshness',
      'icons',
      'inventory',
      'meta',
      'weapons',
    ]);
    expect(payload).not.toHaveProperty('career');
    expect(payload).not.toHaveProperty('recommendations');
    expect(payload).not.toHaveProperty('earnings');
  });

  it('derives character fields from character_stat', () => {
    expect(payload.character).toMatchObject({
      nick: 'tester',
      region: 'ru',
      clanName: 'Клан',
      clanRank: 'Лидер',
      kd: 2.5,
      accuracy: 25,
      headshot: 20,
      hours: 123,
      achievements: 42,
      achievementPoints: null,
      arrived: '2024-06-01',
    });
    expect(payload.character.stats).toMatchObject({ kil: 250, dea: 100, 'pla-tim': 123 });
  });

  it('carries the stored profile fetch marker into the character section', () => {
    seed.upsertCharacter(db, { nick: 'tester', region: 'ru', profileFetchedAt: '2026-01-01T00:00:00.000Z' });

    expect(buildPayload(db).character.profileFetchedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps one owned row per copy and reads typed weapon numbers', () => {
    expect(payload.weapons).toHaveLength(1);
    expect(payload.weapons[0]).toMatchObject({
      name: 'АК-12',
      lvl: 15,
      dmg: 55,
      rof: 600,
      dps: 550,
      ttk: 1,
      dmg15: 55,
      dps15: 550,
      ttk15: 1,
      mag: 30,
      caliber: '5.45x39',
      rank: 'master',
    });
  });

  it('uses the container override and its slots', () => {
    expect(payload.containers[0]).toMatchObject({
      name: 'Рюкзак',
      slots: 4,
      eff: 80,
      prot: 10,
      type: 'Рюкзак',
      artifacts: [{ name: 'Нервяк', lvl: 15 }],
      artifactsAsOf: null,
    });
  });

  it('builds the catalog rows from typed rows and keeps cards out of the page payload', () => {
    expect(payload.catalog.weapons.map((w) => w.name)).toEqual(['АК-12', 'KS-1']);
    expect(payload.catalog.weapons.find((w) => w.name === 'АК-12')).toMatchObject({
      dmg15: 55,
      dps15: 550,
      ttk15: 1,
    });
    expect(payload).not.toHaveProperty('details');
  });

  it('attaches the card to owned rows and keeps the full map in the export', () => {
    const owned = [
      ...payload.weapons,
      ...payload.armor,
      ...payload.containers,
      ...payload.artifacts,
    ] as { card?: { kind?: string; name?: string } }[];
    expect(owned.length).toBeGreaterThan(0);
    for (const row of owned) expect(row.card).toMatchObject({ kind: expect.any(String), name: expect.any(String) });

    expect(exportProfileJson(db).details['art:Нервяк']).toMatchObject({ name: 'Нервяк' });
  });

  it('exports the new profile shape without legacy sections', () => {
    const exported = exportProfileJson(db);
    expect(Object.keys(exported).sort()).toEqual([
      'armor',
      'artifacts',
      'catalog',
      'character',
      'containers',
      'details',
      'inventory',
      'meta',
      'weapons',
    ]);
    expect(exported.details['art:Нервяк']).toMatchObject({ kind: 'artifact', name: 'Нервяк', effects: 'Скорость' });
    expect(exported).not.toHaveProperty('career');
    expect(exported).not.toHaveProperty('recommendations');
    expect(exported).not.toHaveProperty('earnings');
    expect(exported.weapons[0]).not.toHaveProperty('raw');
  });

  it('counts every catalog kind in meta.items, not only weapons and armor', () => {
    const shown = payload.weapons.length + payload.armor.length;
    expect(payload.catalog.meta.items).toBeGreaterThan(shown);
    expect(payload.catalog.meta.items).toBe(
      (db.prepare(`SELECT COUNT(*) AS c FROM item`).get() as { c: number }).c,
    );
  });

  it('returns empty sections and a null character for an empty database', () => {
    const empty = openDb(path.join(dir, 'empty.db'));
    try {
      migrate(empty, migrationsDir);
      const out = buildPayload(empty);
      expect(out.character).toEqual({});
      expect(out.weapons).toEqual([]);
      expect(out.catalog).toEqual({
        weapons: [],
        armor: [],
        devices: [],
        meta: { updated: null, source: '', items: 0 },
      });
    } finally {
      closeDb(path.join(dir, 'empty.db'));
    }
  });
});
