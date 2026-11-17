import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@dossier/core';
import { getCharacterRead, upsertCharacter } from '@dossier/core/modules/identity';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-identity-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('identity read', () => {
  it('returns null without a character and derived nulls with one', () => {
    expect(getCharacterRead(db)).toBeNull();
    const id = upsertCharacter(db, { nick: 'Tester', region: 'ru' });
    const read = getCharacterRead(db);
    expect(read?.id).toBe(id);
    expect(read?.kd).toBeNull();
    expect(read?.hours).toBeNull();
    expect(read?.stats).toEqual({});
  });
});
