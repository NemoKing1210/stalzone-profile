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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-prices-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  repo.ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('prices', () => {
  it('reads the newest price per name, quality and bonus', () => {
    repo.ensureDefaultSources(db);
    seed.insertPriceQuote(db, {
      name: 'АК-12',
      quality: 'Редкий',
      bonus: 0,
      lotPrice: 100,
      sourceId: 'scpmodel',
      fetchedAt: '2026-01-01T00:00:00.000Z',
    });
    seed.insertPriceQuote(db, {
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
