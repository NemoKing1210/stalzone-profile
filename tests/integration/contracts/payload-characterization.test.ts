import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPayload, closeDb, migrate, openDb, type Db } from '@dossier/core';
import { seedCatalog } from '../../fixtures/seed';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
let dir: string;
let db: Db;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-characterization-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  seedCatalog(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

describe('payload characterization', () => {
  it('keeps the current read shape and values', () => {
    expect(buildPayload(db)).toMatchSnapshot();
  });
});
