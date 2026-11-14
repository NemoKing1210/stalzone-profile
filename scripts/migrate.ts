import { loadConfig } from '@dossier/core/config';
import { openDb } from '@dossier/core/db';
import { migrate } from '@dossier/core/db/migrate';

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const result = migrate(db, cfg.migrationsDir);
console.log(
  JSON.stringify(
    { db: cfg.dbPath, applied: result.applied, skipped: result.skipped.length },
    null,
    2,
  ),
);
