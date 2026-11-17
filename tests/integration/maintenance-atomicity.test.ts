import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db, clearAll, rollbackEvent, listEvents } from '@dossier/core';
import { seedCatalog } from '../fixtures/seed';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-maintenance-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  seedCatalog(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('maintenance atomicity', () => {
  it('writes exactly one event for clearAll and restores it in one rollback', () => {
    const before = listEvents(db).length;
    const cleared = clearAll(db, false);
    expect(listEvents(db).length).toBe(before + 1);
    const rolled = rollbackEvent(db, cleared.eventId!, false);
    expect(rolled.dryRun).toBe(false);
    expect(listEvents(db).length).toBe(before + 2);
  });
});
