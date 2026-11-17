import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  ensureDefaultSources,
  migrate,
  openDb,
  type Db,
  bestPrice,
  latestPriceFetchedAt,
  latestPriceRows,
} from '@profile/core';
import { insertPriceQuote } from '@profile/core/testing';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-prices-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('price_latest', () => {
  it('picks the newest quote per name, quality and bonus', () => {
    const old = '2026-11-15T10:00:00.000Z';
    const fresh = '2026-11-15T11:00:00.000Z';
    insertPriceQuote(db, {
      name: 'Нервяк',
      quality: 'Редкий',
      bonus: 1,
      lotPrice: 100,
      sourceId: 'scpmodel',
      fetchedAt: old,
    });
    insertPriceQuote(db, {
      name: 'Нервяк',
      quality: 'Редкий',
      bonus: 1,
      lotPrice: 90,
      sourceId: 'scpmodel',
      fetchedAt: fresh,
    });
    insertPriceQuote(db, {
      name: 'Нервяк',
      quality: 'Обычный',
      bonus: null,
      lotPrice: 50,
      sourceId: 'scpmodel',
      fetchedAt: old,
    });

    const rows = latestPriceRows(db, 'Нервяк', 'Редкий');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lot_price: 90, fetched_at: fresh });
    expect(bestPrice(db, 'Нервяк', 'Обычный')?.lot_price).toBe(50);
    expect(latestPriceFetchedAt(db)).toBe(fresh);
  });
});
