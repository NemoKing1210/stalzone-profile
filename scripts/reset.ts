import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '@profile/core/config';

const cfg = loadConfig();
for (const file of [cfg.dbPath, `${cfg.dbPath}-wal`, `${cfg.dbPath}-shm`]) {
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    console.log('removed', path.relative(cfg.rootDir, file));
  }
}
console.log('database reset; run npm run db:migrate');
