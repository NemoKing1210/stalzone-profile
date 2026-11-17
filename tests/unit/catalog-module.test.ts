import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@dossier/core';
import { iconsByItemIds, itemsByIds, searchItems, statsByItemIds } from '@dossier/core/modules/catalog';
import { seedCatalog } from '../fixtures/seed';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-catalog-'));
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
