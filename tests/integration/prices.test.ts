import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, ensureDefaultSources, loadConfig, migrate, openDb, type Db } from '@dossier/core';
import {
  bestPrice,
  insertPriceSnapshot,
  latestPriceRows,
  latestPriceSnapshotAt,
} from '@dossier/core/repo/prices';
import { pricesAgeMin, runSync } from '@dossier/core/services/sync';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-prices-'));
  const cfg = loadConfig({
    dbPath: path.join(dir, 'test.db'),
    seedsDir: path.join(process.cwd(), 'db', 'seeds'),
  });
  db = openDb(cfg.dbPath);
  migrate(db, cfg.migrationsDir);
  ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('price_latest', () => {
  it('picks the newest snapshot per name, quality and bonus', () => {
    const old = '2026-11-15T10:00:00.000Z';
    const fresh = '2026-11-15T11:00:00.000Z';
    insertPriceSnapshot(db, {
      name: 'Нервяк',
      quality: 'Редкий',
      bonus: 1,
      lotPrice: 100,
      sourceId: 'scpmodel',
      fetchedAt: old,
    });
    insertPriceSnapshot(db, {
      name: 'Нервяк',
      quality: 'Редкий',
      bonus: 1,
      lotPrice: 90,
      sourceId: 'scpmodel',
      fetchedAt: fresh,
    });
    insertPriceSnapshot(db, {
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
    expect(latestPriceSnapshotAt(db)).toBe(fresh);
  });
});

describe('scpmodel sync', () => {
  it('keeps the previous price and reports age when the source returns 500', async () => {
    const previous = new Date(Date.now() - 30 * 60_000).toISOString();
    insertPriceSnapshot(db, {
      name: 'Нервяк',
      quality: 'Редкий',
      lotPrice: 123,
      sourceId: 'scpmodel',
      fetchedAt: previous,
    });

    const result = await runSync(db, 'scpmodel', {
      fetchImpl: async () => jsonResponse({ detail: 'down' }, 500),
    });

    expect(result.status).toBe('stale');
    expect(result.error).toContain('500');
    expect(bestPrice(db, 'Нервяк', 'Редкий')?.lot_price).toBe(123);
    expect(pricesAgeMin(db)).toBeGreaterThanOrEqual(29);
    expect(result.ageMin).toBeGreaterThanOrEqual(29);

    const source = db.prepare(`SELECT status, last_error FROM source WHERE id = 'scpmodel'`).get() as {
      status: string;
      last_error: string | null;
    };
    expect(source.status).toBe('stale');
    expect(source.last_error).toContain('500');
  });

  it('does not call the source inside the 15 minute TTL', async () => {
    insertPriceSnapshot(db, {
      name: 'Нервяк',
      quality: 'Редкий',
      lotPrice: 123,
      sourceId: 'scpmodel',
      fetchedAt: new Date().toISOString(),
    });

    let calls = 0;
    const result = await runSync(db, 'scpmodel', {
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse([]);
      },
    });

    expect(calls).toBe(0);
    expect(result.status).toBe('ok');
    expect(result.items).toBe(0);
    expect(result.ageMin).toBeLessThanOrEqual(1);
  });

  it('stores fresh rows and links them to known items', async () => {
    db.prepare(`INSERT INTO item (source_id, exbo_id, name, name_norm, kind, raw, updated_at)
      VALUES ('scpmodel', 'wg1', 'Нервяк', 'нервяк', 'artifact', '{}', '2026-11-15T00:00:00Z')`).run();

    const result = await runSync(db, 'scpmodel', {
      fetchImpl: async () =>
        jsonResponse([
          {
            item_key: 'wg1',
            item_id: 'wg1',
            name: 'Нервяк',
            qlt_label: 'Редкий',
            _qlt: 'rare',
            _bonus: 1,
            is_artifact: true,
            current_price: 110,
            min_lot: 100,
            lot_count: 3,
            last_trade_price: 105,
            lot_updated_at: '2026-11-15T10:00:00Z',
          },
        ]),
    });

    expect(result.status).toBe('ok');
    expect(result.items).toBe(1);
    const row = bestPrice(db, 'Нервяк', 'Редкий');
    expect(row?.lot_price).toBe(100);
    expect(row?.item_id).toBeTruthy();
    expect(row?.lot_count).toBe(3);
  });
});
