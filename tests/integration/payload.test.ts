import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPayload, closeDb, exportDossierJson, migrate, openDb, type Db } from '@dossier/core';
import { seedCatalog } from '../fixtures/seed';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

let dir: string;
let db: Db;
let payload: ReturnType<typeof buildPayload>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-payload-'));
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
      'builds',
      'catalog',
      'character',
      'containers',
      'details',
      'freshness',
      'icons',
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
    expect(payload.character.stats).toMatchObject({ kil: 250, dea: 100, 'pla-tim': 'PT123H' });
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
      artifactsAsOf: '2026-01-01T00:00:00.000Z',
    });
  });

  it('builds the catalog, details and build sections from typed rows', () => {
    expect(payload.catalog.weapons.map((w) => w.name)).toEqual(['АК-12', 'KS-1']);
    expect(payload.catalog.weapons.find((w) => w.name === 'АК-12')).toMatchObject({
      dmg15: 55,
      dps15: 550,
      ttk15: 1,
    });
    expect(payload.details['art:Нервяк']).toMatchObject({ kind: 'artifact', name: 'Нервяк', effects: 'Скорость' });
    expect(payload.builds.items[0]).toMatchObject({
      id: 'speed',
      metrics: [{ l: 'DPS', v: '550', s: null }],
      total: null,
    });
  });

  it('exports the new dossier shape without legacy sections', () => {
    const exported = exportDossierJson(db);
    expect(Object.keys(exported).sort()).toEqual([
      'armor',
      'artifacts',
      'builds',
      'catalog',
      'character',
      'containers',
      'details',
      'meta',
      'weapons',
    ]);
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
      expect(out.details).toEqual({});
      expect(out.catalog).toEqual({ weapons: [], armor: [], meta: { updated: null, source: '', items: 0 } });
    } finally {
      closeDb(path.join(dir, 'empty.db'));
    }
  });
});
