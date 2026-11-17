import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@dossier/core';
import * as repo from '@dossier/core';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-builds-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  repo.ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('builds and prices', () => {
  it('stores metrics in build_metric and replaces them on save', () => {
    repo.saveBuild(db, {
      slug: 'speed',
      title: 'Скорость',
      metrics: [{ l: 'DPS', v: '100', s: null }],
      rows: [{ label: 'Нервяк', price: 1000 }],
    });
    const build = repo.getBuild(db, 'speed')!;
    expect(repo.listBuildMetrics(db, build.id)).toEqual([
      { build_id: build.id, position: 0, label: 'DPS', value: '100', sub: null },
    ]);
    repo.saveBuild(db, { slug: 'speed', title: 'Скорость', metrics: [{ l: 'TTK', v: '1.0', s: 'сек' }], rows: [] });
    expect(repo.listBuildMetrics(db, build.id).map((m) => m.label)).toEqual(['TTK']);
    expect(repo.listBuildSlots(db, build.id)).toEqual([]);
  });

  it('reads the newest price per name, quality and bonus', () => {
    repo.ensureDefaultSources(db);
    repo.insertPriceQuote(db, {
      name: 'АК-12',
      quality: 'Редкий',
      bonus: 0,
      lotPrice: 100,
      sourceId: 'scpmodel',
      fetchedAt: '2026-01-01T00:00:00.000Z',
    });
    repo.insertPriceQuote(db, {
      name: 'АК-12',
      quality: 'Редкий',
      bonus: 0,
      lotPrice: 200,
      sourceId: 'scpmodel',
      fetchedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(repo.latestPriceRows(db, 'АК-12', 'Редкий')).toHaveLength(1);
    expect(repo.bestPrice(db, 'АК-12', 'Редкий')?.lot_price).toBe(200);
    expect(repo.latestPriceFetchedAt(db)).toBe('2026-01-02T00:00:00.000Z');
  });
});
