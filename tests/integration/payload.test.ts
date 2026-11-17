import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, loadConfig, migrate, openDb, type Db } from '@dossier/core';
import { importLegacy } from '@dossier/core/services/import';
import { buildPayload, type Payload } from '@dossier/core/services/payload';
import { exportLegacyJson } from '@dossier/core/services/export';

let dir: string;
let db: Db;
let payload: Payload;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-payload-'));
  const cfg = loadConfig({
    dbPath: path.join(dir, 'test.db'),
    seedsDir: path.join(process.cwd(), 'db', 'seeds'),
    iconsDir: path.join(dir, 'icons'),
  });
  db = openDb(cfg.dbPath);
  migrate(db, cfg.migrationsDir);
  importLegacy(db, cfg);
  payload = buildPayload(db);
});

afterAll(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('buildPayload contract', () => {
  it('returns every dossier section', () => {
    expect(Object.keys(payload).sort()).toEqual(
      [
        'armor',
        'artifacts',
        'builds',
        'career',
        'catalog',
        'character',
        'containers',
        'details',
        'earnings',
        'freshness',
        'icons',
        'meta',
        'recommendations',
        'weapons',
      ].sort(),
    );
  });

  it('keeps the legacy counts', () => {
    expect(payload.weapons).toHaveLength(35);
    expect(payload.armor).toHaveLength(12);
    expect(payload.containers).toHaveLength(3);
    expect(payload.artifacts).toHaveLength(22);
    expect(payload.recommendations).toHaveLength(4);
    expect(payload.earnings?.rows).toHaveLength(12);
    expect('notes' in payload).toBe(false);
  });

  it('does not import notes content blocks', () => {
    expect(db.prepare(`SELECT COUNT(*) AS count FROM content_block WHERE kind = 'notes'`).get()).toEqual({ count: 0 });
  });

  it('expands copies with stable names and levels', () => {
    const winchesters = payload.weapons.filter((w: { name: string }) => w.name === 'Winchester M70');
    expect(winchesters).toHaveLength(2);
    expect(winchesters.map((w: { lvl: number }) => w.lvl)).toEqual([0, 0]);

    const nervyak = payload.artifacts.filter((a: { name: string }) => a.name === 'Нервяк');
    expect(nervyak).toHaveLength(3);
    expect(nervyak.map((a: { lvl: number }) => a.lvl)).toEqual([15, 15, 15]);
  });

  it('keeps qualities apart for artifacts', () => {
    const ezhik = payload.artifacts.filter((a: { name: string }) => a.name === 'Стальной Ежик');
    expect(ezhik).toHaveLength(2);
    expect(ezhik.map((a: { q: string | null }) => a.q).sort()).toEqual(['Редкий 141%', 'Редкий 142,32%']);
  });

  it('exposes owned ids and content slugs for edit forms without changing the legacy export', () => {
    for (const section of [payload.weapons, payload.armor, payload.containers, payload.artifacts]) {
      expect(section.every((row: { ownedId?: number }) => typeof row.ownedId === 'number')).toBe(true);
    }
    const exported = exportLegacyJson(db);
    expect(Object.keys(exported.weapons[0])).not.toContain('ownedId');
    expect(exported).not.toHaveProperty('notes');
    expect(Object.keys(exported.recommendations[0]).sort()).toEqual(['id', 'lead', 'rows', 'title']);
  });
});

describe('weapon numbers', () => {
  it('uses the legacy fallback for «Огниво»', () => {
    const w = payload.weapons.find((x: { name: string }) => x.name === '«Огниво»');
    expect(w).toMatchObject({ dmg: 10, rof: 600, dps: 100, ttk: 5.9, dmg15: null, dps15: null, ttk15: null });
  });

  it('leaves Chiappa +15 values empty instead of inventing them', () => {
    const w = payload.weapons.find((x: { name: string }) => x.name === 'Обрез Chiappa Triple');
    expect(w).toMatchObject({ dmg: 167.6, rof: 200, dps: 559, dmg15: null, dps15: null, ttk15: null });
  });
});

describe('table-backed catalog and details', () => {
  it('keeps duplicate catalog armor positions', () => {
    const names = payload.catalog.armor.map((entry: { name: string }) => entry.name);
    expect(names.filter((name: string) => name === 'Куртка с бронежилетом')).toHaveLength(2);
    expect(names.filter((name: string) => name === 'Бандитский кожак')).toHaveLength(2);
    expect(payload.catalog.weapons).toHaveLength(356);
  });

  it('exposes exact legacy detail keys', () => {
    expect(Object.keys(payload.details)).toHaveLength(601);
    expect(payload.details['art:Нервяк']).toMatchObject({ kind: 'artifact', name: 'Нервяк' });
    expect(payload.details['w:АК-12']).toBeDefined();
  });
});

describe('freshness', () => {
  it('reports data and price timestamps plus sources', () => {
    expect(typeof payload.freshness.dataUpdated).toBe('string');
    expect(typeof payload.freshness.pricesUpdatedAt).toBe('string');
    expect(payload.freshness.pricesAgeMin).toBeGreaterThanOrEqual(0);
    const ids = payload.freshness.sources.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['exbo_base', 'wiki', 'scpmodel', 'profile', 'motifs']));
    expect(payload.freshness.sources.find((s) => s.id === 'scpmodel')?.status).toBe('ok');
  });
});

describe('empty database', () => {
  it('returns an empty payload instead of throwing', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-empty-'));
    const empty = openDb(path.join(emptyDir, 'empty.db'));
    try {
      migrate(empty, path.join(process.cwd(), 'db', 'migrations'));
      const out = buildPayload(empty);
      expect(out.character).toEqual({});
      expect(out.weapons).toEqual([]);
      expect(out.details).toEqual({});
      expect(out.catalog).toEqual({ weapons: [], armor: [], meta: {} });
      expect(out.builds.items).toEqual([]);
      expect(typeof out.freshness.dataUpdated).not.toBe('undefined');
    } finally {
      closeDb(path.join(emptyDir, 'empty.db'));
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
