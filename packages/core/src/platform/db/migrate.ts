import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './index.js';

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

/** Applies `NNNN_*.sql` files in order, one transaction per migration. */
export function migrate(db: Db, migrationsDir: string): MigrateResult {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migration (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`migrations dir not found: ${migrationsDir}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d+.*\.sql$/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  const applied: string[] = [];
  const skipped: string[] = [];
  const has = db.prepare(`SELECT 1 FROM _migration WHERE version = ?`);

  const previousForeignKeys = Number(db.pragma('foreign_keys', { simple: true })) === 1;
  db.pragma('foreign_keys = OFF');
  try {
    for (const file of files) {
      if (has.get(file)) {
        skipped.push(file);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const run = db.transaction(() => {
        db.exec(sql);
        db.prepare(`INSERT INTO _migration (version, applied_at) VALUES (?, ?)`).run(file, new Date().toISOString());
      });
      run();
      applied.push(file);
    }
  } finally {
    db.pragma(`foreign_keys = ${previousForeignKeys ? 'ON' : 'OFF'}`);
  }

  if (applied.length) {
    const violations = db.pragma('foreign_key_check') as unknown[];
    if (violations.length) throw new Error(`foreign key violations after migrations: ${violations.length}`);
  }

  return { applied, skipped };
}

export function migrationStatus(db: Db): { version: string; applied_at: string }[] {
  try {
    return db.prepare(`SELECT version, applied_at FROM _migration ORDER BY version`).all() as {
      version: string;
      applied_at: string;
    }[];
  } catch {
    return [];
  }
}
