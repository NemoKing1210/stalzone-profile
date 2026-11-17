import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db, buildDetails, buildItemCard } from '@profile/core';
import * as repo from '@profile/core';
import { seedCatalog } from '../fixtures/seed';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-catalog-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  seedCatalog(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('catalog view', () => {
  it('derives a weapon card from typed stats', () => {
    const card = buildItemCard(db, repo.findItemByKindName(db, 'weapon', 'АК-12')!);
    expect(card).toMatchObject({
      kind: 'weapon',
      name: 'АК-12',
      type: 'Автоматы',
      rank: 'master',
      caliber: '5.45x39',
      mag: 30,
    });
    expect(card.p0).toMatchObject({ d0: 40 });
    expect(card.p15).toMatchObject({ d0: 55 });
  });

  it('derives an armor curve and a container card', () => {
    expect(buildItemCard(db, repo.findItemByKindName(db, 'armor', 'Куница')!).curve).toHaveLength(16);
    expect(buildItemCard(db, repo.findItemByKindName(db, 'container', 'Рюкзак')!)).toMatchObject({
      slots: 4,
      eff: 80,
      prot: 10,
    });
  });

  it('returns null for a missing optional value instead of zero', () => {
    const card = buildItemCard(db, repo.findItemByKindName(db, 'weapon', 'KS-1')!);
    expect(card.spread).toBeNull();
    expect(card.recoil).toBeNull();
  });

  it('builds details keys with the legacy prefixes', () => {
    expect(Object.keys(buildDetails(db)).sort()).toEqual(
      ['a:Куница', 'art:Нервяк', 'c:Рюкзак', 'w:АК-12', 'w:KS-1'].sort(),
    );
  });
});
