import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ExboDamageProfile {
  sd: number | null;
  ds: number | null;
  ee: number | null;
  ed: number | null;
  max: number | null;
}

export interface ExboItem {
  id: string;
  cat: string;
  ru: string | null;
  en: string | null;
  rank: string | null;
  st: Record<string, number | number[] | string>;
  txt: string[];
  dmg: ExboDamageProfile | null;
  items: unknown[];
}

export const EXBO_REPO = 'EXBO-Studio/stalzone-database';
export const EXBO_BRANCH = 'main';
export const EXBO_API = `https://api.github.com/repos/${EXBO_REPO}/`;
export const EXBO_RAW = `https://raw.githubusercontent.com/${EXBO_REPO}/${EXBO_BRANCH}/`;

/** Same text resolution the legacy SZsync parser used. */
function textOf(value: Json | null | undefined): any {
  if (!value) return null;
  if (value.type === 'text') return value.text;
  return value.lines?.ru ?? value.lines?.en ?? value.key ?? null;
}

/**
 * Mirrors the legacy `SZ_PARSE`: numeric stats, ranges, key-value stats, text blocks
 * and the damage profile. Labels are collected into the caller's map, as before.
 */
export function parseExboItem(json: Json, labels: Record<string, string> = {}): ExboItem {
  const record: ExboItem = {
    id: String(json.id),
    cat: String(json.category ?? ''),
    ru: textOf(json.name),
    en: json.name?.lines?.en ?? null,
    rank: json.color ?? null,
    st: {},
    txt: [],
    dmg: null,
    items: [],
  };

  const label = (node: Json | null | undefined) => {
    if (node?.key && node?.lines?.ru) labels[node.key] = node.lines.ru;
  };

  const walk = (blocks: Json[] | null | undefined) => {
    for (const block of blocks ?? []) {
      if (!block || typeof block !== 'object') continue;
      switch (block.type) {
        case 'list':
          for (const element of block.elements ?? []) {
            if (element.type === 'numeric') {
              label(element.name);
              if (typeof element.value === 'number' && element.name?.key) {
                record.st[element.name.key] = element.value;
              }
            } else if (element.type === 'range') {
              label(element.name);
              if (element.name?.key) record.st[element.name.key] = [element.min, element.max];
            } else if (element.type === 'key-value') {
              label(element.key);
              const value = textOf(element.value);
              if (element.key?.key && value != null) record.st[`kv:${element.key.key}`] = value;
            } else if (element.type === 'text' || element.type === 'item') {
              const text = textOf(element.text || element.name);
              if (text) record.txt.push(text);
            }
          }
          break;
        case 'grouped':
          walk(block.compact);
          walk(block.detailed);
          break;
        case 'damage':
          record.dmg = {
            sd: block.startDamage ?? null,
            ds: block.damageDecreaseStart ?? null,
            ee: block.damageDecreaseEnd ?? null,
            ed: block.endDamage ?? null,
            max: block.maxDistance ?? null,
          };
          break;
        case 'text': {
          const text = textOf(block.text);
          if (text) record.txt.push(text);
          break;
        }
        default:
          if (Array.isArray(block.elements)) walk([{ type: 'list', elements: block.elements }]);
      }
    }
  };

  walk(json.infoBlocks);
  return record;
}

export interface ExboFetchOptions {
  cacheDir: string;
  realm?: string;
  force?: boolean;
  fetchImpl?: FetchLike;
  concurrency?: number;
}

export interface ExboFetchResult {
  commit: string | null;
  commitDate: string | null;
  fetchedAt: string;
  items: ExboItem[];
  labels: Record<string, string>;
  cached: boolean;
}

interface ExboCache extends ExboFetchResult {
  realm: string;
}

function readCache(file: string): ExboCache | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as ExboCache;
  } catch {
    return null;
  }
}

function writeCache(file: string, cache: ExboCache): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, file);
}

async function getJson(url: string, fetchImpl: FetchLike, init?: RequestInit): Promise<any> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'stalcraft-dossier',
      ...(init?.headers ?? {}),
    },
  });
  if (response.status !== 200) throw new Error(`EXBO HTTP ${response.status}: ${url}`);
  return response.json();
}

async function mapLimit<T, R>(
  list: T[],
  limit: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(list.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < list.length) {
      const index = next++;
      out[index] = await worker(list[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, run));
  return out;
}

/**
 * Downloads the official EXBO item repository into an aggregate cache.
 * The git commit is the cache key: an unchanged commit costs one API call.
 */
export const exboAdapter = {
  async fetch(options: ExboFetchOptions): Promise<ExboFetchResult> {
    const realm = options.realm ?? 'ru';
    const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    const cacheFile = path.join(options.cacheDir, `exbo-${realm}.json`);
    const cached = readCache(cacheFile);

    const head = await getJson(`${EXBO_API}commits/${EXBO_BRANCH}`, fetchImpl);
    const commit: string | null = head?.sha ?? null;
    const commitDate: string | null = head?.commit?.committer?.date ?? null;

    if (!options.force && cached && cached.commit === commit) {
      return { ...cached, cached: true };
    }

    const tree = await getJson(`${EXBO_API}git/trees/${EXBO_BRANCH}?recursive=1`, fetchImpl);
    const paths = ((tree?.tree ?? []) as { path: string }[])
      .map((node) => node.path)
      .filter(
        (file) =>
          file.startsWith(`${realm}/items/`) &&
          file.endsWith('.json') &&
          !file.includes('/skins/') &&
          !file.includes('/armor_motif/'),
      );

    const labels: Record<string, string> = {};
    const items = await mapLimit(paths, options.concurrency ?? 16, async (file) => {
      const response = await fetchImpl(EXBO_RAW + file, {
        headers: { 'user-agent': 'stalcraft-dossier' },
      });
      if (response.status !== 200) throw new Error(`EXBO HTTP ${response.status}: ${file}`);
      return parseExboItem((await response.json()) as Json, labels);
    });

    const result: ExboCache = {
      realm,
      commit,
      commitDate,
      fetchedAt: new Date().toISOString(),
      items,
      labels,
      cached: false,
    };
    writeCache(cacheFile, result);
    return result;
  },
};
