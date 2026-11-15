import fs from 'node:fs';
import path from 'node:path';
import { displayDmg, displayDps, displayTtk } from '@dossier/core/calc/weapons';
import { loadConfig } from '@dossier/core/config';
import { openDb } from '@dossier/core/db';
import { migrate } from '@dossier/core/db/migrate';
import { buildPayload } from '@dossier/core/services/payload';
import { round } from '@dossier/shared';

type Json = any;

/** Stored legacy values that disagree with the formula; asserted exactly. */
const KNOWN_LEGACY_DELTAS: string[] = [];

interface GoldenWeapon {
  name: string;
  lvl: number;
  dmg: number | null;
  rof: number | null;
  dmg15: number | null;
  stored: { dps: number | null; ttk: number | null; dps15: number | null; ttk15: number | null };
  expected: {
    dmg: number | null;
    dps: number | null;
    ttk: number | null;
    dmg15: number | null;
    dps15: number | null;
    ttk15: number | null;
  };
}

interface Golden {
  generatedAt: string;
  weapons: GoldenWeapon[];
  armor: Json[];
  builds: Json[];
  containers: Json[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function fromLegacy(legacy: Json): Golden {
  return {
    generatedAt: new Date().toISOString(),
    weapons: (legacy.weapons ?? []).map((w: Json) => {
      const dmg = num(w.dmg);
      const dmg15 = num(w.dmg15);
      const rof = num(w.rof);
      return {
        name: w.name,
        lvl: w.lvl ?? 0,
        dmg,
        rof,
        dmg15,
        stored: {
          dps: num(w.dps),
          ttk: num(w.ttk),
          dps15: num(w.dps15),
          ttk15: num(w.ttk15),
        },
        expected: {
          dmg: displayDmg(dmg),
          dps: displayDps(dmg, rof),
          ttk: displayTtk(dmg, rof),
          dmg15: displayDmg(dmg15),
          dps15: displayDps(dmg15, rof),
          ttk15: displayTtk(dmg15, rof),
        },
      };
    }),
    armor: (legacy.armor ?? []).map((a: Json) => ({
      name: a.name,
      lvl: a.lvl,
      armor: round(Number(a.armor), 1),
      armor15: round(Number(a.armor15), 1),
      prot: a.prot ?? {},
    })),
    builds: (legacy.builds?.items ?? []).map((b: Json) => ({ id: b.id, total: b.total, rows: b.rows?.length ?? 0 })),
    containers: (legacy.containers ?? []).map((c: Json) => ({
      name: c.name,
      slots: c.slots,
      eff: c.eff,
      slotEq: round((Number(c.slots) * Number(c.eff)) / 100, 2),
    })),
  };
}

function legacyDeltas(fixture: Golden): string[] {
  const deltas: string[] = [];
  for (const w of fixture.weapons) {
    const prefix = `${w.name}@${w.lvl}`;
    const pairs: [string, number | null, number | null, number][] = [
      ['dps', w.stored.dps, w.expected.dps, 0.5],
      ['ttk', w.stored.ttk, w.expected.ttk, 0.01],
      ['dps15', w.stored.dps15, w.expected.dps15, 0.5],
      ['ttk15', w.stored.ttk15, w.expected.ttk15, 0.01],
    ];
    for (const [field, stored, expected, tol] of pairs) {
      if (stored == null) continue;
      if (expected == null || Math.abs(stored - expected) > tol + 1e-9) {
        deltas.push(`${prefix}.${field}`);
      }
    }
  }
  return deltas;
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
    const actual = payload.weapons.find(
      (w: Json) => w.name === expected.name && w.lvl === expected.lvl,
    );
    if (!actual) {
      mismatches.push(`weapon ${expected.name}@${expected.lvl}: missing`);
      continue;
    }
    const label = `${expected.name}@${expected.lvl}`;
    cmp(`${label}.dmg`, actual.dmg, expected.expected.dmg, 0.05);
    cmp(`${label}.dps`, actual.dps, expected.expected.dps, 0.5);
    cmp(`${label}.ttk`, actual.ttk, expected.expected.ttk, 0.01);
    cmp(`${label}.dmg15`, actual.dmg15, expected.expected.dmg15, 0.05);
    cmp(`${label}.dps15`, actual.dps15, expected.expected.dps15, 0.5);
    cmp(`${label}.ttk15`, actual.ttk15, expected.expected.ttk15, 0.01);
  }

  for (const expected of fixture.armor) {
    const actual = payload.armor.find((a: Json) => a.name === expected.name);
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
    const actual = payload.builds.items.find((b: Json) => b.id === expected.id);
    if (!actual) {
      mismatches.push(`build ${expected.id}: missing`);
      continue;
    }
    cmp(`${expected.id}.total`, actual.total, expected.total, 0);
    cmp(`${expected.id}.rows`, actual.rows?.length, expected.rows, 0);
  }

  for (const expected of fixture.containers) {
    const actual = payload.containers.find((c: Json) => c.name === expected.name);
    if (!actual) {
      mismatches.push(`container ${expected.name}: missing`);
      continue;
    }
    const slotEq = round((Number(actual.slots) * Number(actual.eff)) / 100, 2);
    cmp(`${expected.name}.slotEq`, slotEq, expected.slotEq, 0.01);
  }

  const deltas = legacyDeltas(fixture).sort();
  const known = [...KNOWN_LEGACY_DELTAS].sort();
  const newDeltas = deltas.filter((d) => !known.includes(d));
  const goneDeltas = known.filter((d) => !deltas.includes(d));

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
        legacyDeltas: deltas,
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
  if (newDeltas.length || goneDeltas.length) {
    if (newDeltas.length) console.log('new legacy deltas:', newDeltas.join(', '));
    if (goneDeltas.length) console.log('documented deltas no longer reproduce:', goneDeltas.join(', '));
    process.exitCode = 1;
  }
}

main();
