import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '@dossier/core/config';
import { openDb } from '@dossier/core/db';

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const legacy = JSON.parse(fs.readFileSync(path.join(cfg.seedsDir, 'legacy.json'), 'utf8'));

console.log('owned kinds:', db.prepare(`SELECT kind, COUNT(*) c FROM owned GROUP BY kind`).all());

const ownedWeapons = db
  .prepare(`SELECT i.name, o.level, o.skin_item_id FROM owned o JOIN item i ON i.id=o.item_id WHERE o.kind='weapon'`)
  .all() as any[];
const legacyWeaponNames = legacy.weapons.map((w: any) => w.name);
console.log('legacy weapons:', legacyWeaponNames.length, 'owned weapons:', ownedWeapons.length);
for (const name of legacyWeaponNames) {
  const matches = ownedWeapons.filter((w) => w.name === name);
  if (!matches.length) console.log('MISSING weapon:', name);
  if (matches.length > 1) console.log('DUP weapon:', name, matches);
}

const ownedArtifacts = db
  .prepare(`SELECT i.name, o.level, o.quality FROM owned o JOIN item i ON i.id=o.item_id WHERE o.kind='artifact' ORDER BY i.name`)
  .all() as any[];
console.log('\nlegacy artifacts:', legacy.artifacts.length, 'owned artifacts:', ownedArtifacts.length);
const legacyArtifactNames = legacy.artifacts.map((a: any) => a.name);
for (const name of new Set(legacyArtifactNames)) {
  const inLegacy = legacy.artifacts.filter((a: any) => a.name === name);
  const inDb = ownedArtifacts.filter((a) => a.name === name);
  if (inLegacy.length !== inDb.length) console.log('artifact count diff:', name, 'legacy', inLegacy.length, 'db', inDb.length, 'legacy rows', inLegacy, 'db rows', inDb);
}

for (const name of ['QBU-191', '«Огниво»', 'Обрез Chiappa Triple', '«Руна» (А)', 'DSA RPD', '«Волна» (А)', 'MK47 Mutant', 'АКС-74У', 'ПП-2000']) {
  const w = legacy.weapons.find((x: any) => x.name === name);
  console.log('\n===', name, JSON.stringify({ lvl: w?.lvl, dmg: w?.dmg, rof: w?.rof, dps: w?.dps, ttk: w?.ttk, dmg15: w?.dmg15, dps15: w?.dps15, ttk15: w?.ttk15 }));
  const o = db
    .prepare(`SELECT o.*, i.raw, i.id AS iid FROM owned o JOIN item i ON i.id=o.item_id WHERE i.name=? AND o.kind='weapon'`)
    .get(name) as any;
  if (!o) {
    console.log('owned row: none');
    continue;
  }
  console.log('owned:', { item_id: o.item_id, level: o.level, extra: o.extra });
  const stats = db
    .prepare(`SELECT key, level, value_num, value_text, source_id FROM item_stat WHERE item_id=? AND (key LIKE '%damage%' OR key LIKE '%rate_of_fire%') ORDER BY key, level`)
    .all(o.item_id);
  console.log('stats:', stats);
  const raw = JSON.parse(o.raw);
  console.log('raw keys:', Object.keys(raw));
  console.log('raw.details:', JSON.stringify(raw.details)?.slice(0, 900));
  console.log('raw.ownedLegacy:', JSON.stringify(raw.ownedLegacy)?.slice(0, 500));
}

console.log('\ncatalog armor raw count:', db.prepare(`SELECT COUNT(*) c FROM item WHERE kind='armor' AND json_extract(raw,'$.catalog') IS NOT NULL`).get());
console.log('legacy catalog armor:', legacy.catalog.armor.length);
const dbCatalogArmorNames = db
  .prepare(`SELECT name FROM item WHERE kind='armor' AND json_extract(raw,'$.catalog') IS NOT NULL`)
  .all()
  .map((r: any) => r.name);
console.log('legacy armor names missing catalog:', legacy.catalog.armor.map((a: any) => a.name).filter((n: string) => !dbCatalogArmorNames.includes(n)));

const dbDetailKeys = new Set<string>();
for (const row of db.prepare(`SELECT kind, raw FROM item`).all() as any[]) {
  const card = JSON.parse(row.raw || '{}')?.details;
  if (!card?.name || !card?.kind) continue;
  const prefix = card.kind === 'weapon' ? 'w' : card.kind === 'armor' ? 'a' : card.kind === 'artifact' ? 'art' : 'c';
  dbDetailKeys.add(`${prefix}:${card.name}`);
}
console.log('\nlegacy details:', Object.keys(legacy.details).length, 'db detail keys:', dbDetailKeys.size);
console.log('missing detail keys:', Object.keys(legacy.details).filter((k) => !dbDetailKeys.has(k)));
console.log('extra detail keys:', [...dbDetailKeys].filter((k) => !(k in legacy.details)).slice(0, 20));
