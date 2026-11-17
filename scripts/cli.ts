import fs from 'node:fs';
import path from 'node:path';
import {
  SYNC_SOURCES,
  exportProfileJson,
  hashPassword,
  loadConfig,
  flushLogs,
  getLogger,
  migrate,
  openDb,
  queryLogs,
  runSync,
  tableExists,
  logStats,
  runSyncAll,
  type Db,
} from '@profile/core';
import { attachCliLogging, flushCliLogging } from './cli-runtime';
import { formatLogs, formatStats, parseLogsArgs } from './logs';

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((arg) => arg.startsWith('--')));
const positional = rest.filter((arg) => !arg.startsWith('--'));

function usage(): never {
  console.error(`Usage: cli <command>

Commands:
  migrate                 apply pending migrations
  logs [flags]            print recent logs: --level= --category= --since=24h --text= --stats --json
  export [file]           write the typed profile JSON export
  sync [source|all]       sync exbo_base | wiki | motifs | scpmodel (default: all)
  backup [dir]            make a SQLite backup (default: snapshots/)
  hash-password [value]   print a scrypt hash (reads stdin when value is omitted)`);
  process.exit(2);
}

/** The open database holds the command's queued diagnostics until the final flush. */
let activeDb: Db | null = null;

function open() {
  const cfg = loadConfig();
  const db = openDb(cfg.dbPath);
  migrate(db, cfg.migrationsDir);
  activeDb = db;
  attachCliLogging(db);
  return { cfg, db };
}

async function main(): Promise<void> {
  switch (command) {
    case 'migrate': {
      const cfg = loadConfig();
      const db = openDb(cfg.dbPath);
      const result = migrate(db, cfg.migrationsDir);
      activeDb = db;
      if (result.applied.length > 0 && tableExists(db, 'log_entry')) {
        attachCliLogging(db);
        getLogger(db, 'db').info('migrations applied', { applied: result.applied });
        flushLogs(db);
      }
      console.log(JSON.stringify({ db: cfg.dbPath, applied: result.applied, skipped: result.skipped.length }));
      return;
    }
    case 'export': {
      const { db } = open();
      const json = JSON.stringify(exportProfileJson(db), null, 2);
      const file = positional[0];
      if (file) {
        fs.writeFileSync(file, json);
        console.log(`wrote ${file}`);
      } else {
        console.log(json);
      }
      return;
    }
    case 'sync': {
      const { cfg, db } = open();
      const requested = positional[0] ?? 'all';
      if (requested !== 'all' && !(SYNC_SOURCES as readonly string[]).includes(requested) && requested !== 'exbo') {
        console.error(`unknown source: ${requested}. Known: ${SYNC_SOURCES.join(', ')}, all, exbo`);
        process.exitCode = 2;
        return;
      }
      const profileApi =
        cfg.stalzoneClientId && cfg.stalzoneClientSecret
          ? {
              clientId: cfg.stalzoneClientId,
              clientSecret: cfg.stalzoneClientSecret,
              apiUrl: cfg.stalzoneApiUrl,
              tokenUrl: cfg.stalzoneTokenUrl,
            }
          : undefined;
      const options = { force: flags.has('--force'), iconsDir: cfg.iconsDir, profileApi };
      const results =
        requested === 'all' ? await runSyncAll(db, options) : [await runSync(db, requested, options)];
      console.log(JSON.stringify({ results }, null, 2));
      if (results.some((result) => result.status !== 'ok')) process.exitCode = 1;
      return;
    }
    case 'logs': {
      const { db } = open();
      const opts = parseLogsArgs(rest);
      if (opts.stats) {
        const stats = logStats(db, 24);
        console.log(opts.json ? JSON.stringify(stats, null, 2) : formatStats(stats));
        return;
      }
      const result = queryLogs(db, opts.query);
      console.log(opts.json ? JSON.stringify(result, null, 2) : formatLogs(result.entries));
      return;
    }
    case 'backup': {
      const { cfg, db } = open();
      const dir = path.resolve(positional[0] ?? cfg.snapshotsDir);
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dest = path.join(dir, `profile-${stamp}.db`);
      await db.backup(dest);
      const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
      for (const entry of fs.readdirSync(dir)) {
        if (!/^profile-.*\.db$/.test(entry)) continue;
        const file = path.join(dir, entry);
        if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file);
      }
      console.log(JSON.stringify({ backup: dest, src: cfg.dbPath }));
      return;
    }
    case 'hash-password': {
      let value = positional[0];
      if (value == null) {
        value = fs.readFileSync(0, 'utf8').replace(/\r?\n$/, '');
      }
      if (!value) {
        console.error('empty password');
        process.exitCode = 2;
        return;
      }
      console.log(hashPassword(value));
      return;
    }
    default:
      usage();
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => flushCliLogging(activeDb));
