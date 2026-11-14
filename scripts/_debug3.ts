import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '@dossier/core/config';
import { openDb } from '@dossier/core/db';
const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const legacy = JSON.parse(fs.readFileSync(path.join(cfg.seedsDir, 'legacy.json'), 'utf8'));
console.log('Болотный item rows:', db.prepare(`SELECT id,name,kind,exbo_id,raw FROM item WHERE name LIKE '%Гнилец%'`).all().map((r:any)=>({id:r.id,name:r.name,kind:r.kind,exbo:r.exbo_id,keys:Object.keys(JSON.parse(r.raw))})));
console.log('Болотный owned:', db.prepare(`SELECT o.*, i.name FROM owned o LEFT JOIN item i ON i.id=o.item_id WHERE i.name LIKE '%Гнилец%'`).all());
console.log('all artifacts owned:');
console.log(db.prepare(`SELECT i.name, o.level, o.quality FROM owned o JOIN item i ON i.id=o.item_id WHERE o.kind='artifact' ORDER BY i.name`).all());
const dbCat = new Set(db.prepare(`SELECT name FROM item WHERE kind='armor' AND json_extract(raw,'$.catalog') IS NOT NULL`).all().map((r:any)=>r.name));
console.log('legacy armor missing catalog:', legacy.catalog.armor.filter((a:any)=>!dbCat.has(a.name)).map((a:any)=>a.name));
for (const name of legacy.catalog.armor.filter((a:any)=>!dbCat.has(a.name)).map((a:any)=>a.name)) {
  console.log(name, db.prepare(`SELECT id,name,kind,source_id,exbo_id,raw FROM item WHERE name=?`).all(name).map((r:any)=>({id:r.id,kind:r.kind,src:r.source_id,exbo:r.exbo_id,keys:Object.keys(JSON.parse(r.raw))})));
}
const detailKeys = new Set<string>();
for (const row of db.prepare(`SELECT raw FROM item`).all() as any[]) {
  const card = JSON.parse(row.raw||'{}')?.details;
  if (!card?.name || !card?.kind) continue;
  const p = card.kind==='weapon'?'w':card.kind==='armor'?'a':card.kind==='artifact'?'art':'c';
  detailKeys.add(`${p}:${card.name}`);
}
console.log('missing detail keys:', Object.keys(legacy.details).filter(k=>!detailKeys.has(k)));
for (const k of Object.keys(legacy.details).filter(k=>!detailKeys.has(k))) console.log(k, JSON.stringify(legacy.details[k]).slice(0,300));
