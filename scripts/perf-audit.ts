import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPayload, closeDb, openDb } from '@profile/core';

/**
 * Read-only payload benchmark. It copies the working database (including WAL) into a temp
 * directory, so the measurement never opens the live file with another writer.
 *
 * Usage: npx tsx scripts/perf-audit.ts [path/to/profile.db]
 */
function copyDatabase(source: string, target: string): void {
  fs.copyFileSync(source, target);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(`${source}${suffix}`)) fs.copyFileSync(`${source}${suffix}`, `${target}${suffix}`);
  }
}

function ms(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function main(): void {
  const source = path.resolve(process.argv[2] ?? 'data/profile.db');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-perf-'));
  const copy = path.join(dir, 'profile.db');
  copyDatabase(source, copy);
  const db = openDb(copy);

  try {
    const counts = {
      items: (db.prepare('SELECT COUNT(*) AS c FROM item').get() as { c: number }).c,
      itemStats: (db.prepare('SELECT COUNT(*) AS c FROM item_stat').get() as { c: number }).c,
      instances: (db.prepare('SELECT COUNT(*) AS c FROM inventory_item').get() as { c: number }).c,
      placements: (db.prepare('SELECT COUNT(*) AS c FROM item_placement').get() as { c: number }).c,
    };

    const coldStart = process.hrtime.bigint();
    const cold = buildPayload(db);
    const coldMs = ms(coldStart);
    const coldBytes = Buffer.byteLength(JSON.stringify(cold));

    const warm: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = process.hrtime.bigint();
      buildPayload(db);
      warm.push(ms(start));
    }

    const details = Object.keys(cold.details).length;
    const catalogRows = {
      weapons: cold.catalog.weapons.length,
      armor: cold.catalog.armor.length,
      devices: cold.catalog.devices.length,
      ownedWeapons: cold.weapons.length,
      ownedArmor: cold.armor.length,
      containers: cold.containers.length,
      artifacts: cold.artifacts.length,
    };

    const queryPlan = db
      .prepare('EXPLAIN QUERY PLAN SELECT * FROM item_stat WHERE item_id = ? AND level = ?')
      .all(1, 0)
      .map((row) => (row as { detail: string }).detail);

    console.log(
      JSON.stringify(
        {
          database: path.relative(process.cwd(), source),
          counts,
          coldMs: Number(coldMs.toFixed(1)),
          coldBytes,
          warmMs: warm.map((value) => Number(value.toFixed(2))),
          details,
          catalogRows,
          queryPlan,
        },
        null,
        2,
      ),
    );
  } finally {
    closeDb(copy);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main();
