import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  ensureDefaultSources,
  migrate,
  openDb,
  type Db,
  listSources,
  SOURCE_IDS,
  defaultSetupRegion,
  setupState,
} from '@dossier/core';
import { upsertCharacter } from '@dossier/core/testing';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-setup-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('setupState', () => {
  it('reports setup needed and an empty catalog on a fresh database', () => {
    expect(setupState(db)).toEqual({ needsSetup: true, catalogItems: 0 });
  });

  it('reports setup done once a character exists', () => {
    upsertCharacter(db, { nick: 'Tester', region: 'ru' });
    expect(setupState(db)).toMatchObject({ needsSetup: false });
  });
});

describe('default sources', () => {
  it('creates every source once and keeps existing status', () => {
    ensureDefaultSources(db);
    ensureDefaultSources(db);

    expect(
      listSources(db)
        .map((row) => row.id)
        .sort(),
    ).toEqual([...SOURCE_IDS].sort());
    expect(SOURCE_IDS).toContain('icons');
    expect(SOURCE_IDS).toContain('profile');
  });
});

describe('defaultSetupRegion', () => {
  it('preselects a live realm and falls back to ru', () => {
    expect(defaultSetupRegion('eu')).toBe('eu');
    expect(defaultSetupRegion('sea')).toBe('sea');
    expect(defaultSetupRegion('global')).toBe('ru');
    expect(defaultSetupRegion(null)).toBe('ru');
  });
});
