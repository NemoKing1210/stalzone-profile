import {
  LOG_CATEGORIES,
  LOG_LEVELS,
  LOG_SOURCES,
  LogQuerySchema,
  type LogCategory,
  type LogGroup,
  type LogLevel,
  type LogQuery,
  type LogQueryResult,
  type LogSource,
  type LogStats,
} from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import { readEffectiveLogging, getQueueState } from '../../../platform/logging/index.js';
import { buildWhere, entryFromRow, type LogRow } from '../repo/entries.js';
import { readLoggingSettings } from './settings.js';

interface GroupRow {
  fingerprint: string;
  level: LogLevel;
  category: LogCategory;
  count: number;
  first_at: string;
  last_at: string;
  sample: string;
}

/** Newest-first entries with a cursor, plus repeat groups over the whole filtered set. */
export function queryLogs(db: Db, input: LogQuery): LogQueryResult {
  const query = LogQuerySchema.parse(input);
  const where = buildWhere(query);

  const rows = db
    .prepare(`SELECT * FROM log_entry ${where.sql} ORDER BY id DESC LIMIT ?`)
    .all(...where.params, query.limit + 1) as LogRow[];
  const hasMore = rows.length > query.limit;
  const entries = rows.slice(0, query.limit).map(entryFromRow);

  const groupsWhere = buildWhere(query, 'l');
  // The sample must belong to the filtered set, not merely to the fingerprint.
  const sampleWhere = buildWhere(query, 'l2');
  const sampleClause = sampleWhere.sql ? sampleWhere.sql.replace(/^WHERE /, 'AND ') : '';
  const groupRows = db
    .prepare(
      `SELECT l.fingerprint, l.level, l.category, COUNT(*) AS count, MIN(l.at) AS first_at, MAX(l.at) AS last_at,
              (SELECT l2.message FROM log_entry l2
                WHERE l2.fingerprint = l.fingerprint ${sampleClause}
                ORDER BY l2.id DESC LIMIT 1) AS sample
       FROM log_entry l
       ${groupsWhere.sql}
       GROUP BY l.fingerprint
       ORDER BY count DESC, last_at DESC
       LIMIT 100`,
    )
    .all(...sampleWhere.params, ...groupsWhere.params) as GroupRow[];

  const groups: LogGroup[] = groupRows.map((row) => ({
    fingerprint: row.fingerprint,
    level: row.level,
    category: row.category,
    count: row.count,
    firstAt: row.first_at,
    lastAt: row.last_at,
    sample: row.sample,
  }));

  return {
    entries,
    groups,
    nextBefore: hasMore ? (entries[entries.length - 1]?.id ?? null) : null,
    hasMore,
  };
}

function zeroes<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

/** Counts, storage size and process queue state; `now` is injectable for tests. */
export function logStats(db: Db, windowHours = 24, now = Date.now()): LogStats {
  const since = new Date(now - windowHours * 3_600_000).toISOString();
  const byLevel = zeroes(LOG_LEVELS);
  const byCategory = zeroes(LOG_CATEGORIES);
  const bySource = zeroes(LOG_SOURCES);

  for (const row of db
    .prepare(`SELECT level, COUNT(*) AS c FROM log_entry WHERE at >= ? GROUP BY level`)
    .all(since) as { level: LogLevel; c: number }[]) {
    byLevel[row.level] = row.c;
  }
  for (const row of db
    .prepare(`SELECT category, COUNT(*) AS c FROM log_entry WHERE at >= ? GROUP BY category`)
    .all(since) as { category: LogCategory; c: number }[]) {
    byCategory[row.category] = row.c;
  }
  for (const row of db
    .prepare(`SELECT source, COUNT(*) AS c FROM log_entry WHERE at >= ? GROUP BY source`)
    .all(since) as { source: LogSource; c: number }[]) {
    bySource[row.source] = row.c;
  }

  const totals = db
    .prepare(
      `SELECT MIN(at) AS oldest, MAX(at) AS newest,
              COALESCE(SUM(length(at) + length(message) + COALESCE(length(context), 0) +
                            COALESCE(length(stack), 0) + length(fingerprint) +
                            COALESCE(length(request_id), 0)), 0) AS bytes
       FROM log_entry`,
    )
    .get() as { oldest: string | null; newest: string | null; bytes: number };

  return {
    windowHours,
    byLevel,
    byCategory,
    bySource,
    oldestAt: totals.oldest,
    newestAt: totals.newest,
    bytes: totals.bytes,
    queue: getQueueState(db),
    settings: readLoggingSettings(db),
  };
}

/** Exposed for the HTTP config route; avoids leaking the whole settings object. */
export function clientLogConfig(db: Db) {
  const settings = readEffectiveLogging(db);
  return {
    enabled: settings.enabled,
    captureClient: settings.captureClient,
    clientConsole: settings.clientConsole,
    levels: settings.levels,
  };
}
