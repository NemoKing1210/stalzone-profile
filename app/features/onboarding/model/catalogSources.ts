export type CatalogSourceId = 'exbo_base' | 'wiki' | 'motifs' | 'scpmodel' | 'icons';

/**
 * How much of the profile depends on a source: `required` builds the item base,
 * `recommended` fills the sections people look at first, `optional` is polish.
 */
export type CatalogSourceLevel = 'required' | 'recommended' | 'optional';

export interface CatalogSource {
  id: CatalogSourceId;
  level: CatalogSourceLevel;
}

/** The catalog is built in this order: items first, then the data layered on them. */
export const CATALOG_SOURCES: readonly CatalogSource[] = [
  { id: 'exbo_base', level: 'required' },
  { id: 'wiki', level: 'recommended' },
  { id: 'motifs', level: 'optional' },
  { id: 'scpmodel', level: 'recommended' },
  { id: 'icons', level: 'optional' },
];

export type CatalogSyncStatus = 'running' | 'ok' | 'stale';

export interface CatalogSourceRun {
  status: CatalogSyncStatus;
  items?: number;
  error?: string;
}

/** Only sources the server knows about, in catalog order. */
export function catalogSources(configured: readonly string[]): CatalogSource[] {
  const known = new Set(configured);
  return CATALOG_SOURCES.filter((source) => known.has(source.id));
}

/** A fresh stored copy or a successful run of this session makes a source ready. */
export function isSourceReady(storedStatus: string, run?: CatalogSourceRun): boolean {
  return (run?.status ?? storedStatus) === 'ok';
}

export interface CatalogProgress {
  done: number;
  total: number;
  percent: number;
}

export function catalogProgress(
  sources: readonly CatalogSource[],
  isReady: (id: CatalogSourceId) => boolean,
): CatalogProgress {
  const total = sources.length;
  const done = sources.filter((source) => isReady(source.id)).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}
