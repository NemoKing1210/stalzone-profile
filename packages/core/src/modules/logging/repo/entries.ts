import type {
  LogCategory,
  LogEntry,
  LogLevel,
  LogSource,
} from '@profile/shared/contracts';

export interface LogRow {
  id: number;
  at: string;
  level: LogLevel;
  category: LogCategory;
  source: LogSource;
  message: string;
  context: string | null;
  stack: string | null;
  request_id: string | null;
  fingerprint: string;
  duration_ms: number | null;
}

export interface LogFilter {
  levels?: readonly LogLevel[];
  categories?: readonly LogCategory[];
  sources?: readonly LogSource[];
  since?: string;
  until?: string;
  text?: string;
  requestId?: string;
  fingerprint?: string;
  minDurationMs?: number;
  before?: number;
}

export interface SqlWhere {
  sql: string;
  params: unknown[];
}

/**
 * Allowlisted predicate shared by reads and purge. Column names come from this
 * function, never from caller text, so the only interpolated identifiers are the
 * fixed ones below and an optional `l`/`log_entry` table alias.
 */
export function buildWhere(filter: LogFilter, alias?: string): SqlWhere {
  const col = (name: string) => (alias ? `${alias}.${name}` : name);
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.levels?.length) {
    clauses.push(`${col('level')} IN (${filter.levels.map(() => '?').join(',')})`);
    params.push(...filter.levels);
  }
  if (filter.categories?.length) {
    clauses.push(`${col('category')} IN (${filter.categories.map(() => '?').join(',')})`);
    params.push(...filter.categories);
  }
  if (filter.sources?.length) {
    clauses.push(`${col('source')} IN (${filter.sources.map(() => '?').join(',')})`);
    params.push(...filter.sources);
  }
  if (filter.since) {
    clauses.push(`${col('at')} >= ?`);
    params.push(filter.since);
  }
  if (filter.until) {
    clauses.push(`${col('at')} < ?`);
    params.push(filter.until);
  }
  if (filter.text) {
    const escaped = filter.text.replace(/[\\%_]/g, '\\$&');
    clauses.push(`${col('message')} LIKE ? ESCAPE '\\'`);
    params.push(`%${escaped}%`);
  }
  if (filter.requestId) {
    clauses.push(`${col('request_id')} = ?`);
    params.push(filter.requestId);
  }
  if (filter.fingerprint) {
    clauses.push(`${col('fingerprint')} = ?`);
    params.push(filter.fingerprint);
  }
  if (filter.minDurationMs != null) {
    clauses.push(`${col('duration_ms')} >= ?`);
    params.push(filter.minDurationMs);
  }
  if (filter.before != null) {
    clauses.push(`${col('id')} < ?`);
    params.push(filter.before);
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function parseJson(value: string | null): unknown {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function entryFromRow(row: LogRow): LogEntry {
  return {
    id: row.id,
    at: row.at,
    level: row.level,
    category: row.category,
    source: row.source,
    message: row.message,
    context: parseJson(row.context),
    stack: row.stack,
    requestId: row.request_id,
    fingerprint: row.fingerprint,
    durationMs: row.duration_ms,
  };
}
