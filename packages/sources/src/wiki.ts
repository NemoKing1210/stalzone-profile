import type { FetchLike } from './exbo.js';

type Json = Record<string, any>;

export const WIKI_BASE = 'https://stalzone.wiki';
export const WIKI_ITEMS = `${WIKI_BASE}/api/builds-calculator/items/`;
export const WIKI_TTK = `${WIKI_BASE}/api/ttk-calculator/items/`;

export interface WikiSnapshot {
  artefact: Json[];
  armor: Json[];
  containers: Json[];
  ttkWeapon: Json[];
  fetchedAt: string;
}

export interface WikiFetchOptions {
  fetchImpl?: FetchLike;
}

async function getItems(url: string, fetchImpl: FetchLike): Promise<Json[]> {
  const response = await fetchImpl(url);
  if (response.status !== 200) throw new Error(`wiki HTTP ${response.status}: ${url}`);
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error(`wiki returned a non-array body: ${url}`);
  return body;
}

function withCategories(base: string, categories: string[]): string {
  const url = new URL(base);
  for (const category of categories) url.searchParams.append('category', category);
  return url.toString();
}

/** Structured item base and TTK data from the public stalzone.wiki API. */
export const wikiAdapter = {
  async fetch(options: WikiFetchOptions = {}): Promise<WikiSnapshot> {
    const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    const [artefact, armor, containers, ttkWeapon] = await Promise.all([
      getItems(withCategories(WIKI_ITEMS, ['artefact']), fetchImpl),
      getItems(withCategories(WIKI_ITEMS, ['armor']), fetchImpl),
      getItems(withCategories(WIKI_ITEMS, ['containers', 'backpacks']), fetchImpl),
      getItems(withCategories(WIKI_TTK, ['weapon']), fetchImpl),
    ]);
    return {
      artefact,
      armor,
      containers,
      ttkWeapon,
      fetchedAt: new Date().toISOString(),
    };
  },
};
