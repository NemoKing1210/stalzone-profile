import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPayload, closeDb, migrate, openDb } from '@dossier/core';
import { seedCatalog } from '../tests/fixtures/seed';

interface GoldenWeapon {
  name: string;
  lvl: number;
  dmg: number | null;
  dps: number | null;
  ttk: number | null;
  dmg15: number | null;
  dps15: number | null;
  ttk15: number | null;
}

interface GoldenArmor {
  name: string;
  armor: number | null;
  armor15: number | null;
  prot?: Record<string, number>;
}

interface GoldenContainer {
  name: string;
  slots: number;
  eff: number;
  slotEq: number;
}

interface Golden {
  weapons: GoldenWeapon[];
  armor: GoldenArmor[];
  containers: GoldenContainer[];
}

type Json = Record<string, any>;

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * Frozen expectations derived from the public/synthetic catalog fixture.
 * They contain no personal data: the golden is a regression check for the
 * formulas and the payload, not a copy of the owner's dossier.
 */
function main(): void {
  const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'golden.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Golden;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-golden-'));
  const dbPath = path.join(dir, 'golden.db');
  const db = openDb(dbPath);
  const mismatches: string[] = [];

  const cmp = (label: string, actual: unknown, expected: unknown, tol: number) => {
    if (typeof actual === 'number' && typeof expected === 'number') {
      if (Math.abs(actual - expected) > tol + 1e-9) {
        mismatches.push(`${label}: ${actual} != ${expected} (tol ${tol})`);
      }
      return;
    }
    if ((actual ?? null) !== (expected ?? null)) {
      mismatches.push(`${label}: ${String(actual)} != ${String(expected)}`);
    }
  };

  try {
    migrate(db, path.join(process.cwd(), 'db', 'migrations'));
    seedCatalog(db);
    const payload = buildPayload(db);

    for (const expected of fixture.weapons) {
      const actual = payload.weapons.find((w: Json) => w.name === expected.name && w.lvl === expected.lvl) as
        | Json
        | undefined;
      if (!actual) {
        mismatches.push(`weapon ${expected.name}@${expected.lvl}: missing`);
        continue;
      }
      const label = `${expected.name}@${expected.lvl}`;
      cmp(`${label}.dmg`, actual.dmg, expected.dmg, 0.05);
      cmp(`${label}.dps`, actual.dps, expected.dps, 0.5);
      cmp(`${label}.ttk`, actual.ttk, expected.ttk, 0.01);
      cmp(`${label}.dmg15`, actual.dmg15, expected.dmg15, 0.05);
      cmp(`${label}.dps15`, actual.dps15, expected.dps15, 0.5);
      cmp(`${label}.ttk15`, actual.ttk15, expected.ttk15, 0.01);
    }

    for (const expected of fixture.armor) {
      const actual = payload.armor.find((a: Json) => a.name === expected.name) as Json | undefined;
      if (!actual) {
        mismatches.push(`armor ${expected.name}: missing`);
        continue;
      }
      cmp(`${expected.name}.armor`, actual.armor, expected.armor, 0.1);
      cmp(`${expected.name}.armor15`, actual.armor15, expected.armor15, 0.1);
      for (const [key, value] of Object.entries(expected.prot ?? {})) {
        cmp(`${expected.name}.prot.${key}`, actual.prot?.[key], value, 0.1);
      }
    }

    for (const expected of fixture.containers) {
      const actual = payload.containers.find((c: Json) => c.name === expected.name) as Json | undefined;
      if (!actual) {
        mismatches.push(`container ${expected.name}: missing`);
        continue;
      }
      cmp(`${expected.name}.slots`, actual.slots, expected.slots, 0);
      cmp(`${expected.name}.eff`, actual.eff, expected.eff, 0.1);
      const slotEq = round((Number(actual.slots) * Number(actual.eff)) / 100, 2);
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
          mismatches: mismatches.length,
          legacyDeltas: [],
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
  } finally {
    closeDb(dbPath);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main();
