import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@profile/core';
import { iconsByItemIds, itemsByIds, searchItems, statsByItemIds } from '@profile/core/modules/catalog';
import { upsertItem } from '@profile/core/testing';
import { seedCatalog } from '../fixtures/seed';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-catalog-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  seedCatalog(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('catalog batch reads', () => {
  it('groups items, stats and icons by item id', () => {
    const [first, second] = searchItems(db, { limit: 2 });
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const ids = [first!.id, second!.id, 999];
    const items = itemsByIds(db, ids);
    expect(items.get(first!.id)?.name).toBe(first!.name);
    expect(items.has(999)).toBe(false);
    expect(statsByItemIds(db, [first!.id]).get(first!.id)?.length).toBeGreaterThan(0);
    expect(iconsByItemIds(db, ids)).toBeInstanceOf(Map);
  });
});

describe('catalog search', () => {
  function addWeapon(name: string, nameEn: string, category = 'weapon/assault_rifle'): void {
    upsertItem(db, {
      sourceId: 'local',
      externalId: `weapon-${name}`,
      name,
      nameEn,
      kind: 'weapon',
      category,
      rank: 'RANK_MASTER',
      slot: 'основное',
      weight: 3.4,
    });
  }

  it('matches every word in any order instead of the whole phrase', () => {
    const names = searchItems(db, { q: '12 ак', kind: 'weapon', limit: 20 }).map((item) => item.name);
    expect(names).toContain('АК-12');
  });

  it('matches the English name for a Russian query and the Russian name for an English query', () => {
    expect(searchItems(db, { q: 'kunitsa', kind: 'armor' }).map((item) => item.name)).toEqual(['Куница']);
    expect(searchItems(db, { q: 'куница', kind: 'armor' }).map((item) => item.name)).toEqual(['Куница']);
  });

  it('finds items by a category phrase when the name does not contain it', () => {
    addWeapon('АК-12М', 'AK-12M');
    const names = searchItems(db, { q: 'assault rifle', kind: 'weapon', limit: 20 }).map((item) => item.name);
    expect(names).toEqual(expect.arrayContaining(['АК-12', 'АК-12М']));
    expect(names).not.toContain('KS-1');
  });

  it('ranks the exact name above a longer name that only contains it', () => {
    upsertItem(db, {
      sourceId: 'local',
      externalId: 'armor-kunitsa-2',
      name: 'Куница-2',
      kind: 'armor',
      category: 'armor/combined',
    });
    const names = searchItems(db, { q: 'куница', kind: 'armor', limit: 20 }).map((item) => item.name);
    expect(names[0]).toBe('Куница');
  });

  it('orders by rank with unranked rows last and the direction applied to the rank', () => {
    const names = searchItems(db, { sort: 'rank', dir: 'desc', limit: 20 }).map((item) => item.name);
    expect(names.slice(0, 2)).toEqual(['АК-12', 'Нервяк']);
    expect(names.indexOf('KS-1')).toBeLessThan(names.indexOf('Куница'));
    expect(names.at(-1)).toBe('Камуфляж');
  });

  it('orders by weight with unowned numbers first and missing weights last', () => {
    const names = searchItems(db, { sort: 'weight', dir: 'asc', limit: 20 }).map((item) => item.name);
    expect(names.slice(0, 3)).toEqual(['KS-1', 'АК-12', 'Куница']);
  });

  it('accepts a normalized rank key as well as the stored rank label', () => {
    const byKey = searchItems(db, { rank: 'master', limit: 20 }).map((item) => item.name);
    const byLabel = searchItems(db, { rank: 'RANK_MASTER', limit: 20 }).map((item) => item.name);
    expect(byKey).toContain('АК-12');
    expect(byLabel).toEqual(byKey);
  });
});
