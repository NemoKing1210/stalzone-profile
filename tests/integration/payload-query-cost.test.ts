import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPayload, closeDb, migrate, openDb, type Db } from '@profile/core';
import { upsertItem } from '@profile/core/testing';
import { seedCatalog } from '../fixtures/seed';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-payload-cost-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  seedCatalog(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Counts every prepared statement while `run` executes. */
function countQueries(run: () => void): number {
  const original = db.prepare.bind(db);
  let count = 0;
  (db as unknown as { prepare: (sql: string) => unknown }).prepare = (sql: string) => {
    count += 1;
    return original(sql);
  };
  try {
    run();
  } finally {
    (db as unknown as { prepare: typeof original }).prepare = original;
  }
  return count;
}

function addWeapons(count: number): void {
  for (let i = 0; i < count; i++) {
    upsertItem(db, {
      externalId: `bulk-w-${i}`,
      name: `Bulk Weapon ${i}`,
      nameKey: `bulk.w${i}`,
      category: 'weapon/rifle',
      kind: 'weapon',
    });
  }
}

describe('payload catalog read cost', () => {
  it('does not issue per-item queries when the catalog grows', () => {
    const baseline = countQueries(() => buildPayload(db));
    addWeapons(100);
    const grown = countQueries(() => buildPayload(db));

    // A per-item query pattern used to add ~6 statements per catalog item (600 here).
    expect(grown - baseline).toBeLessThanOrEqual(20);
  });

  it('still exposes the extra catalog rows', () => {
    addWeapons(3);
    const payload = buildPayload(db);
    expect(Object.keys(payload.details)).toContain('w:Bulk Weapon 0');
    expect(payload.catalog.weapons.map((row) => row.name)).toContain('Bulk Weapon 2');
  });
});
