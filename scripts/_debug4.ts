import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '@dossier/core/config';
import { openDb } from '@dossier/core/db';
import { norm } from '@dossier/shared';
const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const legacy = JSON.parse(fs.readFileSync(path.join(cfg.seedsDir, 'legacy.json'), 'utf8'));
const arr = legacy.catalog.armor;
const byNorm = new Map<string, any[]>();
for (const a of arr) { const k=norm(a.name); byNorm.set(k,[...(byNorm.get(k)||[]),a]); }
console.log('legacy armor catalog', arr.length, 'unique norm', byNorm.size);
for (const [k,v] of byNorm) if (v.length>1) console.log('dup norm', k, v.map((x:any)=>x.name));
const dbItems = db.prepare(`SELECT name, exbo_id, source_id, json_extract(raw,'$.catalog') cat FROM item WHERE kind='armor'`).all() as any[];
console.log('db armor items', dbItems.length, 'with catalog', dbItems.filter(r=>r.cat).length);
const dbNames = new Set(dbItems.map(r=>norm(r.name)));
console.log('legacy armor names not in db:', arr.filter((a:any)=>!dbNames.has(norm(a.name))).map((a:any)=>a.name));
const dbCatNames = dbItems.filter(r=>r.cat).map(r=>norm(r.name));
const dupDb = dbCatNames.filter((n,i)=>dbCatNames.indexOf(n)!==i);
console.log('dup db catalog armor names:', dupDb);
// weapons duplicates in catalog
const warr = legacy.catalog.weapons; const wby = new Map<string,any[]>();
for (const a of warr) { const k=norm(a.name); wby.set(k,[...(wby.get(k)||[]),a]); }
console.log('legacy weapon catalog', warr.length, 'unique norm', wby.size);
for (const [k,v] of wby) if (v.length>1) console.log('dup weapon norm', k, v.map((x:any)=>x.name));
const dbW = db.prepare(`SELECT COUNT(*) c FROM item WHERE kind='weapon' AND json_extract(raw,'$.catalog') IS NOT NULL`).get() as any;
console.log('db weapon catalog count', dbW.c);
