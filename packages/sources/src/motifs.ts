import { defaultFetch, type FetchLike } from './exbo.js';
import { WIKI_ITEMS } from './wiki.js';

type Json = Record<string, any>;

export type MotifKind = 'weapon' | 'armor' | null;

export interface MotifRow {
  skin: string;
  key: string;
  token: string;
  kind: MotifKind;
}

export const MOTIFS_URL = `${WIKI_ITEMS}?category=other`;

/**
 * `item.motif.wpn.ks1_ssop.name` → token `ks1_ssop`.
 * The token is the only link between a cosmetic name and its base item.
 */
export function parseMotif(record: Json): MotifRow | null {
  const key = String(record?.name?.key ?? '');
  const skin = record?.name?.lines?.ru;
  if (!key || !skin) return null;
  const match = /^item\.(?:motif|style)\.(wpn|arm)\.(.+?)(?:\.name)?$/.exec(key);
  if (!match) return null;
  return {
    skin,
    key,
    token: match[2]!,
    kind: match[1] === 'wpn' ? 'weapon' : 'armor',
  };
}

export interface MotifsFetchOptions {
  fetchImpl?: FetchLike;
}

/** Cosmetic names and their base-item tokens from the wiki `other` category. */
export const motifsAdapter = {
  async fetch(options: MotifsFetchOptions = {}): Promise<MotifRow[]> {
    const fetchImpl = options.fetchImpl ?? defaultFetch;
    const response = await fetchImpl(MOTIFS_URL);
    if (response.status !== 200) throw new Error(`motifs HTTP ${response.status}: ${MOTIFS_URL}`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error('motifs returned a non-array body');
    return body.map(parseMotif).filter((row): row is MotifRow => row !== null);
  },
};
