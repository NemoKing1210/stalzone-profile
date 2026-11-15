import type { Db } from '../db/index.js';
import { buildPayload } from './payload.js';

type Json = any;

const WEAPON_KEYS = [
  'name',
  'skin',
  'slot',
  'lvl',
  'mag',
  'weight',
  'role',
  'caliber',
  'cat',
  'dmg',
  'rof',
  'dps',
  'spread',
  'recoil',
  'dist',
  'type',
  'rank',
  'dmg15',
  'dps15',
  'ttk',
  'ttk15',
];
const ARMOR_KEYS = ['name', 'skin', 'cls', 'weight', 'lvl', 'armor', 'rank', 'armor15', 'prot', 'mods'];
const CONTAINER_KEYS = [
  'name',
  'type',
  'weight',
  'slots',
  'eff',
  'prot',
  'shield',
  'bonus',
  'rank',
  'artifacts',
  'artifactsAsOf',
];
const ARTIFACT_KEYS = ['name', 'type', 'q', 'lvl', 'effects', 'rank'];
const CHARACTER_KEYS = [
  'nick',
  'realm',
  'alliance',
  'faction',
  'clan',
  'arrived',
  'hours',
  'kd',
  'accuracy',
  'headshot',
  'achievements',
  'achievementPoints',
  'money',
  'maxMoney',
  'stash',
  'playstyle',
];
const NOTE_KEYS = ['title', 'text'];
const RECOMMENDATION_KEYS = ['id', 'title', 'lead', 'rows'];

function pick(obj: Json, keys: string[]): Json {
  const out: Json = {};
  for (const key of keys) out[key] = obj?.[key] ?? null;
  return out;
}

/**
 * Rebuilds the legacy `data/my-gear.json` shape from the database.
 * Display-only extras (`icons`, `freshness`) are intentionally dropped.
 */
export function exportLegacyJson(db: Db, characterId?: number): Json {
  const payload = buildPayload(db, characterId);
  return {
    meta: payload.meta,
    character: pick(payload.character, CHARACTER_KEYS),
    career: payload.career,
    weapons: payload.weapons.map((w) => pick(w, WEAPON_KEYS)),
    armor: payload.armor.map((a) => pick(a, ARMOR_KEYS)),
    containers: payload.containers.map((c) => pick(c, CONTAINER_KEYS)),
    artifacts: payload.artifacts.map((a) => pick(a, ARTIFACT_KEYS)),
    notes: payload.notes.map((note) => pick(note, NOTE_KEYS)),
    catalog: payload.catalog,
    recommendations: payload.recommendations.map((recommendation) => pick(recommendation, RECOMMENDATION_KEYS)),
    details: payload.details,
    earnings: payload.earnings,
    builds: {
      updated: payload.builds.updated,
      priceNote: payload.builds.priceNote,
      items: payload.builds.items,
      avoid: payload.builds.avoid,
      current: payload.builds.current,
    },
  };
}
