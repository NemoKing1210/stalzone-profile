import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

const cache = new Map<string, Db>();

/** Prepared statements are reusable for the life of the handle; sync loops prepare once. */
const statementCache = new WeakMap<Db, Map<string, Database.Statement<unknown[]>>>();

/** Returns a cached prepared statement for a fixed SQL string. Never use for dynamic SQL. */
export function cachedStatement(db: Db, sql: string): Database.Statement<unknown[]> {
  let statements = statementCache.get(db);
  if (!statements) {
    statements = new Map();
    statementCache.set(db, statements);
  }
  let statement = statements.get(sql);
  if (!statement) {
    statement = db.prepare(sql);
    statements.set(sql, statement);
  }
  return statement;
}

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
    // A profile is small enough to keep hot pages resident; the map avoids read syscalls.
    db.pragma('cache_size = -64000');
    db.pragma('mmap_size = 268435456');
    db.pragma('temp_store = MEMORY');
  }
  cache.set(key, db);
  return db;
}

export function closeDb(dbPath: string): void {
  const key = path.resolve(dbPath);
  for (const suffix of ['', '#ro']) {
    const db = cache.get(key + suffix);
    if (!db?.open) continue;
    try {
      db.pragma('optimize');
    } catch {
      /* a read-only or already-closing handle cannot optimize */
    }
    db.close();
    cache.delete(key + suffix);
  }
}

export function closeAll(): void {
  for (const db of cache.values()) {
    if (!db.open) continue;
    try {
      db.pragma('optimize');
    } catch {
      /* best effort on shutdown */
    }
    db.close();
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

/**
 * Monotonic per-connection write counter. Any INSERT/UPDATE/DELETE through this
 * handle changes it, so read-model caches can key on data instead of a TTL.
 */
export function dataVersion(db: Db): number {
  const row = cachedStatement(db, 'SELECT total_changes() AS c').get() as { c: number };
  return Number(row.c);
}
