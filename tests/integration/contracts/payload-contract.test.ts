import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPayload, closeDb, migrate, openDb, setupState, type Db } from '@dossier/core';
import { PayloadSchema, SetupStateSchema } from '@dossier/shared/contracts';
import { seedCatalog } from '../../fixtures/seed';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-contract-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('payload contract', () => {
  it('parses an empty dossier without throwing', () => {
    const parsed = PayloadSchema.parse(buildPayload(db));
    expect(parsed.character).toEqual({});
    expect(parsed.weapons).toEqual([]);
    expect(SetupStateSchema.parse(setupState(db))).toEqual({ needsSetup: true, catalogItems: 0 });
  });

  it('parses a seeded catalog payload', () => {
    seedCatalog(db);
    expect(() => PayloadSchema.parse(buildPayload(db))).not.toThrow();
  });
});
