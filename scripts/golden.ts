import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '@dossier/core/config';
import { openDb } from '@dossier/core/db';
import { migrate } from '@dossier/core/db/migrate';
import { buildPayload } from '@dossier/core/services/payload';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const round = (v: number | null | undefined, d = 2) =>
  typeof v === 'number' ? Number((Math.round(v * 10 ** d) / 10 ** d).toFixed(d)) : null;

interface Golden {
  generatedAt: string;
  weapons: Json[];
  armor: Json[];
  builds: Json[];
  containers: Json[];
}

function fromLegacy(legacy: Json): Golden {
  return {
    generatedAt: new Date().toISOString(),
    weapons: (legacy.weapons ?? []).map((w: Json) => ({
      name: w.name,
      lvl: w.lvl,
      dmg: round(w.dmg),
      dps: round(w.dps),
      ttk: round(w.ttk, 3),
      dmg15: round(w.dmg15),
      dps15: round(w.dps15),
      ttk15: round(w.ttk15, 3),
    })),
    armor: (legacy.armor ?? []).map((a: Json) => ({
      name: a.name,
      lvl: a.lvl,
      armor: round(a.armor),
      armor15: round(a.armor15),
      prot: a.prot ?? {},
    })),
    builds: (legacy.builds?.items ?? []).map((b: Json) => ({ id: b.id, total: b.total, rows: b.rows?.length ?? 0 })),
    containers: (legacy.containers ?? []).map((c: Json) => ({
      name: c.name,
      slots: c.slots,
      eff: c.eff,
      slotEq: round((Number(c.slots) * Number(c.eff)) / 100),
    })),
  };
}

function main(): void {
  const cfg = loadConfig();
  const fixturePath = path.join(cfg.rootDir, 'tests', 'fixtures', 'golden.json');
  const legacy = JSON.parse(fs.readFileSync(path.join(cfg.seedsDir, 'legacy.json'), 'utf8')) as Json;

  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
    fs.writeFileSync(fixturePath, JSON.stringify(fromLegacy(legacy), null, 2));
    console.log('golden fixture written:', fixturePath);
    return;
  }

  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Golden;
  const db = openDb(cfg.dbPath);
  migrate(db, cfg.migrationsDir);
  const payload = buildPayload(db);

  const mismatches: string[] = [];
  const cmp = (label: string, actual: unknown, expected: unknown, tol: number) => {
    if (typeof actual === 'number' && typeof expected === 'number') {
      if (Math.abs(actual - expected) > tol + 1e-9) {
        mismatches.push(`${label}: ${actual} != ${expected} (tol ${tol})`);
      }
      return;
    }
    if (actual !== expected) mismatches.push(`${label}: ${String(actual)} != ${String(expected)}`);
  };

  for (const expected of fixture.weapons) {
    const actual = payload.weapons.find((w) => w.name === expected.name);
    if (!actual) {
      mismatches.push(`weapon ${expected.name}: missing`);
      continue;
    }
    cmp(`${expected.name}.dmg`, actual.dmg, expected.dmg, 0.05);
    cmp(`${expected.name}.dps`, actual.dps, expected.dps, 0.5);
    cmp(`${expected.name}.ttk`, actual.ttk, expected.ttk, 0.01);
    cmp(`${expected.name}.dmg15`, actual.dmg15, expected.dmg15, 0.05);
    cmp(`${expected.name}.dps15`, actual.dps15, expected.dps15, 0.5);
    cmp(`${expected.name}.ttk15`, actual.ttk15, expected.ttk15, 0.01);
  }

  for (const expected of fixture.armor) {
    const actual = payload.armor.find((a) => a.name === expected.name);
    if (!actual) {
      mismatches.push(`armor ${expected.name}: missing`);
      continue;
    }
    cmp(`${expected.name}.armor`, actual.armor, expected.armor, 0.1);
    cmp(`${expected.name}.armor15`, actual.armor15, expected.armor15, 0.1);
    for (const [key, value] of Object.entries(expected.prot ?? {})) {
      if (typeof value !== 'number') continue;
      cmp(`${expected.name}.prot.${key}`, actual.prot?.[key], value, 0.1);
    }
  }

  for (const expected of fixture.builds) {
    const actual = payload.builds.items.find((b) => b.id === expected.id);
    if (!actual) {
      mismatches.push(`build ${expected.id}: missing`);
      continue;
    }
    cmp(`${expected.id}.total`, actual.total, expected.total, 0);
    cmp(`${expected.id}.rows`, actual.rows?.length, expected.rows, 0);
  }

  for (const expected of fixture.containers) {
    const actual = payload.containers.find((c) => c.name === expected.name);
    if (!actual) {
      mismatches.push(`container ${expected.name}: missing`);
      continue;
    }
    const slotEq = round((Number(actual.slots) * Number(actual.eff)) / 100);
    cmp(`${expected.name}.slotEq`, slotEq, expected.slotEq, 0.01);
  }

  console.log(
    JSON.stringify(
      {
        weapons: payload.weapons.length,
        armor: payload.armor.length,
        containers: payload.containers.length,
        artifacts: payload.artifacts.length,
        details: Object.keys(payload.details).length,
        catalogWeapons: payload.catalog.weapons.length,
        catalogArmor: payload.catalog.armor.length,
        builds: payload.builds.items.length,
        mismatches: mismatches.length,
      },
      null,
      2,
    ),
  );
  if (mismatches.length) {
    console.log(mismatches.slice(0, 60).join('\n'));
    if (mismatches.length > 60) console.log(`... +${mismatches.length - 60} more`);
    process.exitCode = 1;
  }
}

main();
