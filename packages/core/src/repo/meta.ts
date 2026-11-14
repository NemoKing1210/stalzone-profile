import type { Db } from '../db/index.js';

export function getMeta<T = unknown>(db: Db, key: string): T | null {
  const row = db.prepare(`SELECT value FROM app_meta WHERE key = ?`).get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function setMeta(db: Db, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value ?? null), new Date().toISOString());
}

export function deleteMeta(db: Db, key: string): void {
  db.prepare(`DELETE FROM app_meta WHERE key = ?`).run(key);
}

export function allMeta(db: Db): Record<string, unknown> {
  const rows = db.prepare(`SELECT key, value FROM app_meta`).all() as { key: string; value: string }[];
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}
