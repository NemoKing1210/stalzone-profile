import {
  LOG_CATEGORIES,
  LOG_LEVELS,
  LOG_SOURCES,
  type LogCategory,
  type LogEntry,
  type LogLevel,
  type LogQuery,
  type LogSource,
  type LogStats,
} from '@profile/shared/contracts';

export interface LogsCliOptions {
  stats: boolean;
  json: boolean;
  query: LogQuery;
}

function fail(message: string): never {
  throw new Error(message);
}

function oneOf<T extends string>(value: string, allowed: readonly T[], what: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  return fail(`unknown ${what}: ${value}. Known: ${allowed.join(', ')}`);
}

function sinceIso(value: string): string {
  const relative = /^(\d+)([mhd])$/.exec(value);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2] === 'm' ? 60_000 : relative[2] === 'h' ? 3_600_000 : 86_400_000;
    return new Date(Date.now() - amount * unit).toISOString();
  }
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) fail(`invalid --since value: ${value} (use 30m, 24h, 7d or an ISO date)`);
  return at.toISOString();
}

function positiveInt(value: string, flag: string, max = Number.MAX_SAFE_INTEGER): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) fail(`invalid ${flag} value: ${value}`);
  return number;
}

/** Parses `npm run logs -- …` flags into a `LogQuery`, never touching the database. */
export function parseLogsArgs(argv: string[]): LogsCliOptions {
  const query: LogQuery = {};
  let stats = false;
  let json = false;

  for (const arg of argv) {
    if (arg === '--stats') {
      stats = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (!arg.startsWith('--')) fail(`unexpected argument: ${arg}`);

    const [flag, raw] = arg.slice(2).split('=', 2);
    const value = raw ?? '';
    switch (flag) {
      case 'level':
        query.levels = [oneOf<LogLevel>(value, LOG_LEVELS, 'level')];
        break;
      case 'category':
        query.categories = [oneOf<LogCategory>(value, LOG_CATEGORIES, 'category')];
        break;
      case 'source':
        query.sources = [oneOf<LogSource>(value, LOG_SOURCES, 'source')];
        break;
      case 'since':
        query.since = sinceIso(value);
        break;
      case 'until':
        query.until = sinceIso(value);
        break;
      case 'text':
        query.text = value;
        break;
      case 'request-id':
        query.requestId = value;
        break;
      case 'fingerprint':
        query.fingerprint = value;
        break;
      case 'limit':
        query.limit = positiveInt(value, '--limit', 200);
        break;
      case 'before':
        query.before = positiveInt(value, '--before');
        break;
      default:
        fail(`unknown flag: --${flag}`);
    }
  }

  return { stats, json, query };
}

/** One line per entry; context and stack stay in `--json`. */
export function formatLogs(entries: LogEntry[]): string {
  if (entries.length === 0) return 'no log entries';
  return entries
    .map((entry) => {
      const duration = entry.durationMs == null ? '' : ` (${entry.durationMs} ms)`;
      return `${entry.at} ${entry.level.padEnd(5)} ${entry.category.padEnd(6)} ${entry.message}${duration}`;
    })
    .join('\n');
}

export function formatStats(stats: LogStats): string {
  const levels = Object.entries(stats.byLevel)
    .map(([level, count]) => `${level}=${count}`)
    .join(' ');
  const categories = Object.entries(stats.byCategory)
    .map(([category, count]) => `${category}=${count}`)
    .join(' ');
  const sources = Object.entries(stats.bySource)
    .map(([source, count]) => `${source}=${count}`)
    .join(' ');
  return [
    `window: ${stats.windowHours}h`,
    `levels: ${levels}`,
    `categories: ${categories}`,
    `sources: ${sources}`,
    `rows: ${stats.bytes} bytes, oldest ${stats.oldestAt ?? '—'}, newest ${stats.newestAt ?? '—'}`,
    `queue: ${stats.queue.queued} queued, ${stats.queue.dropped} dropped`,
  ].join('\n');
}
