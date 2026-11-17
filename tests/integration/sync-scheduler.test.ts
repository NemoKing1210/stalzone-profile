import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  ensureDefaultSources,
  migrate,
  openDb,
  runDueBundles,
  runSyncSequence,
  setSyncSchedule,
  type Db,
} from '@dossier/core';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-scheduler-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

const PRICES = [{ name: 'АК-12', item_id: 'wg53', min_lot: 100, lot_count: 2, _qlt: 'rare', _bonus: 0 }];
const fetchPrices = async (url: string) =>
  url.includes('scpmodel.ru')
    ? new Response(JSON.stringify(PRICES), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response('not found', { status: 404 });

describe('due bundle runs', () => {
  it('runs the price bundle only when due', async () => {
    setSyncSchedule(db, { enabled: true, catalogEveryMin: 0, pricesEveryMin: 15, profileEveryMin: 0, dryRun: false });
    const first = await runDueBundles(db, { fetchImpl: fetchPrices });
    expect(first.map((result) => result.source)).toEqual(['scpmodel']);
    expect(first[0]).toMatchObject({ status: 'ok', items: 1 });

    const second = await runDueBundles(db, { fetchImpl: fetchPrices });
    expect(second).toEqual([]);
  });

  it('marks a failing source stale instead of throwing', async () => {
    setSyncSchedule(db, { enabled: true, catalogEveryMin: 0, pricesEveryMin: 15, profileEveryMin: 0, dryRun: false });
    const results = await runDueBundles(db, {
      fetchImpl: async () => new Response('boom', { status: 500 }),
    });
    expect(results[0]).toMatchObject({ source: 'scpmodel', status: 'stale' });
  });

  it('skips the profile bundle without credentials and does not touch its source row', async () => {
    setSyncSchedule(db, { enabled: true, catalogEveryMin: 0, pricesEveryMin: 0, profileEveryMin: 60, dryRun: false });
    const results = await runDueBundles(db, { fetchImpl: fetchPrices });
    expect(results).toEqual([]);
    const row = db.prepare("SELECT last_try_at FROM source WHERE id = 'profile'").get() as {
      last_try_at: string | null;
    };
    expect(row.last_try_at).toBeNull();
  });

  it('runs a sequence in the given order', async () => {
    const results = await runSyncSequence(db, ['scpmodel', 'scpmodel'], { fetchImpl: fetchPrices });
    expect(results.map((result) => result.source)).toEqual(['scpmodel', 'scpmodel']);
  });
});
