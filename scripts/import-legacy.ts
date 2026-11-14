import { loadConfig } from '@dossier/core/config';
import { openDb } from '@dossier/core/db';
import { migrate } from '@dossier/core/db/migrate';
import { importLegacy } from '@dossier/core/services/import';

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
migrate(db, cfg.migrationsDir);
const started = Date.now();
const report = importLegacy(db, cfg);
console.log(JSON.stringify({ ...report, ms: Date.now() - started, db: cfg.dbPath }, null, 2));
