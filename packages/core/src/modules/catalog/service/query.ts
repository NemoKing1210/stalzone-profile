import { rankKey } from '@profile/shared';
import type { CatalogQuery, CatalogQueryResult, CatalogRow, ItemSummary } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import { WriteError } from '../../../platform/journal/index.js';
import { CATALOG_METRICS, metricByKey, metricRow, metricValue, type MetricContext } from '../metrics.js';
import {
  findItemByKindName,
  getIcon,
  iconsByItemIds,
  listStatDefinitions,
  searchItems,
  statValueBaseFrom,
  statsByItemIds,
  type ItemRow,
} from '../repo/index.js';
import { buildItemCardFrom, loadItemCardContext } from './catalog-view.js';
import { itemSummary } from './read.js';

const CANDIDATE_LIMIT = 5000;

type FilterValue = number | string | null;

function knownKeys(db: Db): string[] {
  const ids = new Set(listStatDefinitions(db).map((definition) => definition.id));
  const rows = db.prepare(`SELECT DISTINCT stat_id FROM item_stat`).all() as { stat_id: string }[];
  for (const row of rows) ids.add(row.stat_id);
  return [...ids];
}

function validateKey(key: string, known: readonly string[]): void {
  if (metricByKey(key) || known.includes(key)) return;
  throw new WriteError(422, 'UNKNOWN_FILTER', `Unknown catalog key: ${key}`, {
    available: [...CATALOG_METRICS.map((metric) => metric.key), ...known].slice(0, 25),
  });
}

function filterValue(ctx: MetricContext, key: string, known: readonly string[]): FilterValue {
  if (metricByKey(key)) return metricValue(ctx, key);
  // A stat may exist only at the base level (container and modifier fields); exact level first.
  if (known.includes(key)) return statValueBaseFrom(ctx.rows, key, ctx.level);
  return null;
}

function passesFilter(value: FilterValue, min: number | undefined, max: number | undefined): boolean {
  if (typeof value !== 'number') return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

function compareValues(a: FilterValue, b: FilterValue, direction: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const base =
    typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'ru');
  return direction === 'asc' ? base : -base;
}

/**
 * One catalog read: candidates by the existing normalized search, then one stats query for
 * sorting/filtering, an in-memory filter/sort/slice, and the page's card context only when
 * `include: 'full'` asks for it. Missing values stay `null` and sort last.
 */
export function queryCatalog(db: Db, input: Partial<CatalogQuery> = {}): CatalogQueryResult {
  const limit = input.limit ?? 20;
  const offset = input.offset ?? 0;
  const level = input.level ?? 15;
  const hp = input.hp ?? 600;
  const include = input.include ?? 'metrics';
  const filters = input.filters ?? [];
  const sort = input.sort;
  const known = knownKeys(db);
  for (const filter of filters) validateKey(filter.key, known);
  if (sort) validateKey(sort.by, known);

  const candidates = searchItems(db, {
    q: input.q ?? null,
    kind: input.kind ?? null,
    rank: input.rank ?? null,
    slot: input.slot ?? null,
    limit: CANDIDATE_LIMIT,
  });
  const truncated = candidates.length === CANDIDATE_LIMIT;
  const needsStats = include !== 'summary' || sort != null || filters.length > 0;
  const candidateStats = needsStats
    ? statsByItemIds(
        db,
        candidates.map((item) => item.id),
        [...new Set([0, level])],
      )
    : null;

  const filtered = candidates.filter((item) => {
    if (!filters.length) return true;
    const ctx: MetricContext = { item, rows: candidateStats?.get(item.id) ?? [], level, hp };
    return filters.every((filter) => passesFilter(filterValue(ctx, filter.key, known), filter.min, filter.max));
  });

  if (sort) {
    filtered.sort((left, right) => {
      const leftCtx: MetricContext = { item: left, rows: candidateStats?.get(left.id) ?? [], level, hp };
      const rightCtx: MetricContext = { item: right, rows: candidateStats?.get(right.id) ?? [], level, hp };
      const compared = compareValues(
        filterValue(leftCtx, sort.by, known),
        filterValue(rightCtx, sort.by, known),
        sort.direction,
      );
      if (compared !== 0) return compared;
      return left.name_norm.localeCompare(right.name_norm, 'ru', { numeric: true });
    });
  }

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);
  const pageIds = page.map((item) => item.id);
  const icons = iconsByItemIds(db, pageIds);
  const pageStats =
    include === 'summary'
      ? null
      : (candidateStats ?? statsByItemIds(db, pageIds, [...new Set([0, level])]));
  const cardContext =
    include === 'full' ? loadItemCardContext(db, pageIds, [...new Set([0, level])], undefined, true, icons) : null;

  const items: CatalogRow[] = page.map((item) => {
    // A summary never carries `stats`; typing it as the base makes the row assignment exact.
    const base: Omit<ItemSummary, 'stats'> = itemSummary(item, icons.get(item.id) ?? null);
    if (include === 'summary') return base;
    const rows = pageStats?.get(item.id) ?? [];
    const row: CatalogRow = {
      ...base,
      metrics: metricRow({ item, rows, level, hp }),
    };
    if (include === 'full' && cardContext) {
      row.card = buildItemCardFrom(cardContext, item);
      row.stats = (cardContext.stats.get(item.id) ?? []).filter(
        (stat) => stat.level === 0 || stat.level === level,
      );
    }
    return row;
  });

  return { items, total, truncated };
}

export interface CompareResult {
  items: Record<string, unknown>[];
  best: Record<string, string | null>;
}

function resolveItem(db: Db, query: string, kind: string | undefined): ItemRow | null {
  const kinds = kind ? [kind] : ['weapon', 'armor', 'container', 'artifact', 'modification'];
  for (const candidateKind of kinds) {
    const item = findItemByKindName(db, candidateKind, query);
    if (item) return item;
  }
  return searchItems(db, { q: query, kind: kind ?? null, limit: 1 })[0] ?? null;
}

/** Compare 2…10 catalog items; `best` names the winner per numeric metric. */
export function compareCatalogItems(
  db: Db,
  queries: string[],
  kind: string | undefined,
  level = 15,
  hp = 600,
): CompareResult {
  const rows: { item: ItemRow; metrics: Record<string, number | string | null> }[] = [];
  const items = queries.map((query) => {
    const item = resolveItem(db, query, kind);
    if (!item) return { query, found: false };
    const stats = statsByItemIds(db, [item.id], [...new Set([0, level])]).get(item.id) ?? [];
    const metrics = metricRow({ item, rows: stats, level, hp });
    rows.push({ item, metrics });
    return {
      query,
      found: true,
      name: item.name,
      kind: item.kind,
      rank: rankKey(item.rank),
      icon: getIcon(db, item.id)?.path ?? null,
      metrics,
    };
  });

  const best: Record<string, string | null> = {};
  for (const metric of CATALOG_METRICS) {
    let winner: { name: string; value: number } | null = null;
    for (const row of rows) {
      const value = row.metrics[metric.key];
      if (typeof value !== 'number') continue;
      if (
        winner == null ||
        (metric.direction === 'higher' ? value > winner.value : value < winner.value)
      ) {
        winner = { name: row.item.name, value };
      }
    }
    if (winner) best[metric.key] = winner.name;
  }

  return { items, best };
}
