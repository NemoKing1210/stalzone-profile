import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '@dossier/core/config';
import { openDb } from '@dossier/core/db';
const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const legacy = JSON.parse(fs.readFileSync(path.join(cfg.seedsDir, 'legacy.json'), 'utf8'));
const names = ['«Руна» (А)','DSA RPD','«Волна» (А)','MK47 Mutant','АКС-74У','ПП-2000','«Огниво»','Обрез Chiappa Triple','QBU-191'];
for (const name of names) {
  const w = legacy.weapons.find((x:any)=>x.name===name);
  console.log(name, JSON.stringify(w));
  const rows = db.prepare(`SELECT o.level, s.key, s.level sl, s.value_num FROM owned o JOIN item i ON i.id=o.item_id JOIN item_stat s ON s.item_id=i.id WHERE i.name=? AND o.kind='weapon' AND s.key IN ('damage.start','weapon.tooltip.weapon.info.rate_of_fire') ORDER BY o.level, s.key, s.level`).all(name);
  console.log('  db:', JSON.stringify(rows));
}
console.log('\nlegacy duplicate weapon entries:');
const seen = new Map<string,number>();
for (const w of legacy.weapons) { const k=w.name+'|'+w.lvl+'|'+(w.skin||''); seen.set(k,(seen.get(k)||0)+1); }
for (const [k,c] of seen) if (c>1) console.log(' ',k,c);
console.log('\nlegacy artifacts duplicate keys:');
const aseen = new Map<string,number>();
for (const a of legacy.artifacts) { const k=a.name+'|'+a.lvl+'|'+(a.q||''); aseen.set(k,(aseen.get(k)||0)+1); }
for (const [k,c] of aseen) if (c>1) console.log(' ',k,c);
