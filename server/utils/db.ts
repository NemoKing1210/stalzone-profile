import path from 'node:path';
import { migrate, openDb, type Db } from '@dossier/core';

let instance: Db | null = null;

/**
 * Process-wide SQLite handle. Migrations run on first use so the Nitro server
 * and every API route see the same schema without a separate boot step.
 */
export function useDb(): Db {
  if (instance) return instance;
  const config = useRuntimeConfig();
  // DB_PATH is read at runtime so the same image works with any mounted volume.
  const dbPath = path.resolve(String(process.env.DB_PATH || config.dbPath || './data/dossier.db'));
  const migrationsDir = path.resolve(process.cwd(), 'db', 'migrations');
  instance = openDb(dbPath);
  migrate(instance, migrationsDir);
  return instance;
}
