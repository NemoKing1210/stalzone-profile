import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@profile/core';
import { compareCatalogItems, queryCatalog } from '@profile/core/modules/catalog';
import { describeCatalog } from '@profile/core/modules/read-model';
import { seedCatalog } from '../fixtures/seed';
import * as seed from '@profile/core/testing';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-catalog-query-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  seedCatalog(db);
  const third = seed.upsertItem(db, {
    externalId: 'weapon:third',
    name: 'Тест-3',
    kind: 'weapon',
    category: 'weapon/assault_rifle',
    rank: 'RANK_COMMON',
    slot: 'primary',
    weight: 3,
  });
  seed.replaceItemStats(
    db,
    third,
    [
      { key: 'damage.start', level: 15, valueNum: 30 },
      { key: 'weapon.tooltip.weapon.info.rate_of_fire', level: 15, valueNum: 600 },
      { key: 'weapon.tooltip.weapon.info.recoil', level: 15, valueNum: 70 },
    ],
    'local',
  );
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('queryCatalog', () => {
  it('sorts weapons by DPS descending and reports the total', () => {
    const result = queryCatalog(db, { kind: 'weapon', sort: 'dps', direction: 'desc', limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.truncated).toBe(false);
    const dps = result.items.map((row) => Number(row.metrics?.dps ?? -1));
    expect(dps).toEqual([...dps].sort((a, b) => b - a));
    expect(result.items[0].name).toBe('АК-12');
  });

  it('filters by a metric and a stat id, and excludes nulls from a min filter', () => {
    const byMetric = queryCatalog(db, { kind: 'weapon', filters: [{ key: 'recoil', max: 60 }] });
    expect(byMetric.items.map((row) => row.name)).toEqual(['АК-12']);
    const byStat = queryCatalog(db, { kind: 'weapon', filters: [{ key: 'damage.start', min: 50 }] });
    expect(byStat.items.map((row) => row.name)).toEqual(['АК-12']);
  });

  it('keeps summary rows free of metrics and full rows carry the card', () => {
    const summary = queryCatalog(db, { kind: 'weapon', include: 'summary', limit: 2 });
    expect(summary.items[0].metrics).toBeUndefined();
    const full = queryCatalog(db, { kind: 'weapon', include: 'full', limit: 1 });
    expect(full.items[0].card?.kind).toBe('weapon');
    expect(full.items[0].stats?.every((stat) => stat.level === 0 || stat.level === 15)).toBe(true);
  });

  it('rejects an unknown filter with the available keys', () => {
    try {
      queryCatalog(db, { kind: 'weapon', filters: [{ key: 'not-a-stat', min: 1 }] });
      throw new Error('expected UNKNOWN_FILTER');
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      expect(code).toBe('UNKNOWN_FILTER');
    }
  });
});

describe('compareCatalogItems', () => {
  it('compares more than two weapons and names the best DPS', () => {
    const result = compareCatalogItems(db, ['АК-12', 'KS-1', 'Тест-3'], 'weapon', 15, 600);
    expect(result.items).toHaveLength(3);
    expect(result.items.find((row) => row.name === 'KS-1')).toMatchObject({ found: true });
    expect(result.best.dps).toBe('АК-12');
  });
});

describe('describeCatalog', () => {
  it('describes kinds, metrics and stat ids with their direction', () => {
    const description = describeCatalog(db);
    expect(description.kinds.find((row) => row.kind === 'weapon')?.count).toBeGreaterThan(0);
    expect(description.metrics.find((row) => row.key === 'dps')?.direction).toBe('higher');
    expect(description.metrics.find((row) => row.key === 'recoil')?.direction).toBe('lower');
    expect(description.stats.some((row) => row.id === 'damage.start')).toBe(true);
    expect(description.meta.items).toBeGreaterThan(0);
  });
});
