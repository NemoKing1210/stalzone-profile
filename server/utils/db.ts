import path from 'node:path';
import {
  bootLog,
  ensureDefaultSources,
  getLogger,
  initLogging,
  migrate,
  openDb,
  tableExists,
  type Db,
} from '@profile/core';

let instance: Db | null = null;

/**
 * Process-wide SQLite handle. Migrations run on first use so the Nitro server
 * and every API route see the same schema without a separate boot step.
 */
export function useDb(): Db {
  if (instance) return instance;
  const config = useRuntimeConfig();
  // DB_PATH is read at runtime so the same image works with any mounted volume.
  const dbPath = path.resolve(String(process.env.DB_PATH || config.dbPath || './data/profile.db'));
  const migrationsDir = path.resolve(process.cwd(), 'db', 'migrations');
  instance = openDb(dbPath);
  const applied = migrate(instance, migrationsDir);
  if (applied.applied.length > 0) {
    if (tableExists(instance, 'log_entry')) {
      initLogging(instance, { source: 'server', processHooks: false });
      getLogger(instance, 'db').info('migrations applied', { applied: applied.applied });
    } else {
      bootLog('info', `migrations applied: ${applied.applied.join(', ')}`);
    }
  }
  // Sources are reference data, not user data: a fresh DB must list them before the first sync.
  ensureDefaultSources(instance);
  return instance;
}
