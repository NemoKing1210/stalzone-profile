import { bootLog, flushLogs, getLogger, initLogging, tableExists } from '@profile/core';
import { loadConfig } from '@profile/core/config';
import { openDb } from '@profile/core/db';
import { migrate } from '@profile/core/db/migrate';

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const result = migrate(db, cfg.migrationsDir);
if (result.applied.length > 0) {
  if (tableExists(db, 'log_entry')) {
    initLogging(db, { source: 'cli', processHooks: false });
    getLogger(db, 'db').info('migrations applied', { applied: result.applied });
    flushLogs(db);
  } else {
    bootLog('info', `migrations applied: ${result.applied.join(', ')}`);
  }
}
console.log(
  JSON.stringify(
    { db: cfg.dbPath, applied: result.applied, skipped: result.skipped.length },
    null,
    2,
  ),
);
