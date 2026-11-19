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
  latestPricesForNames,
  type PriceRowsByName,
} from '@profile/core';
import { insertPriceQuote, insertPriceQuotes } from '@profile/core/testing';

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

  it('keeps one current quote per name, quality and bonus', () => {
    insertPriceQuotes(db, [
      { name: 'Нервяк', quality: 'Редкий', bonus: 1, lotPrice: 100, sourceId: 'scpmodel', fetchedAt: '2026-11-15T10:00:00.000Z' },
    ]);
    insertPriceQuotes(db, [
      { name: 'Нервяк', quality: 'Редкий', bonus: 1, lotPrice: 90, sourceId: 'scpmodel', fetchedAt: '2026-11-15T11:00:00.000Z' },
      { name: 'Нервяк', quality: 'Обычный', bonus: null, lotPrice: 50, sourceId: 'scpmodel', fetchedAt: '2026-11-15T11:00:00.000Z' },
    ]);

    expect(db.prepare(`SELECT COUNT(*) AS c FROM price_quote`).get()).toEqual({ c: 2 });
    expect(bestPrice(db, 'Нервяк', 'Редкий')?.lot_price).toBe(90);
    expect(bestPrice(db, 'Нервяк', 'Обычный')?.lot_price).toBe(50);
  });

  it('resolves many names with one statement', () => {
    const names = Array.from({ length: 60 }, (_, index) => `Item ${index}`);
    for (const [index, name] of names.entries()) {
      insertPriceQuote(db, { name, currentPrice: 100 + index, sourceId: 'scpmodel', fetchedAt: '2026-11-15T10:00:00.000Z' });
    }

    const original = db.prepare.bind(db);
    let prepared = 0;
    Object.assign(db, {
      prepare: (sql: string) => {
        prepared += 1;
        return original(sql);
      },
    });
    let prices: PriceRowsByName;
    try {
      prices = latestPricesForNames(db, names);
    } finally {
      Object.assign(db, { prepare: original });
    }

    expect(prepared).toBeLessThan(10);
    expect(prices['Item 59']?.[0]?.current_price).toBe(159);
  });
});
