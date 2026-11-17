import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

const cache = new Map<string, Db>();

export interface OpenDbOptions {
  readonly?: boolean;
  verbose?: boolean;
}

/** Opens (and caches) a SQLite database with the project pragmas. */
export function openDb(dbPath: string, opts: OpenDbOptions = {}): Db {
  const key = path.resolve(dbPath) + (opts.readonly ? '#ro' : '');
  const cached = cache.get(key);
  if (cached && cached.open) return cached;

  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }

  const db = new Database(dbPath, {
    readonly: opts.readonly ?? false,
    verbose: opts.verbose ? (sql: unknown) => console.debug(String(sql)) : undefined,
  });

  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }
  cache.set(key, db);
  return db;
}

export function closeDb(dbPath: string): void {
  const key = path.resolve(dbPath);
  for (const suffix of ['', '#ro']) {
    const db = cache.get(key + suffix);
    if (db?.open) db.close();
    cache.delete(key + suffix);
  }
}

export function closeAll(): void {
  for (const db of cache.values()) {
    if (db.open) db.close();
  }
  cache.clear();
}

export function tableExists(db: Db, name: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as { name: string } | undefined;
  return !!row;
}

export function nowIso(): string {
  return new Date().toISOString();
}
