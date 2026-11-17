import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db, withTransaction, WriteError } from '@dossier/core';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-journal-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('journal transaction kernel', () => {
  it('commits a successful block and rolls back a thrown WriteError', () => {
    withTransaction(db, () =>
      db
        .prepare('INSERT INTO source (id, kind, updated_at) VALUES (?, ?, ?)')
        .run('test_commit', 'test', '2026-01-01T00:00:00.000Z'),
    );
    expect(db.prepare('SELECT COUNT(*) AS n FROM source WHERE id = ?').get('test_commit')).toEqual({ n: 1 });
    expect(() =>
      withTransaction(db, () => {
        db.prepare('INSERT INTO source (id, kind, updated_at) VALUES (?, ?, ?)').run(
          'test_rollback',
          'test',
          '2026-01-01T00:00:00.000Z',
        );
        throw new WriteError(422, 'TEST', 'rollback');
      }),
    ).toThrow(WriteError);
    expect(db.prepare('SELECT COUNT(*) AS n FROM source WHERE id = ?').get('test_rollback')).toEqual({ n: 0 });
  });
});
