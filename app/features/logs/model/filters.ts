import {
  LOG_CATEGORIES,
  LOG_LEVELS,
  LOG_SOURCES,
  type LogCategory,
  type LogLevel,
  type LogQuery,
  type LogSource,
} from '@profile/shared/contracts';

export type LogWindow = '1h' | '24h' | '7d' | 'all';

export interface LogFilters {
  levels: LogLevel[];
  categories: LogCategory[];
  sources: LogSource[];
  window: LogWindow;
  text: string;
  requestId: string;
  fingerprint: string;
}

/** Read-only view, so a caller can pass `as const` literals without widening them. */
export type LogFiltersInput = Omit<LogFilters, 'levels' | 'categories' | 'sources'> & {
  levels: readonly LogLevel[];
  categories: readonly LogCategory[];
  sources: readonly LogSource[];
};

const WINDOWS: LogWindow[] = ['1h', '24h', '7d', 'all'];
const WINDOW_MS: Record<Exclude<LogWindow, 'all'>, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
};

export const EMPTY_LOG_FILTERS: LogFilters = {
  levels: [],
  categories: [],
  sources: [],
  window: '24h',
  text: '',
  requestId: '',
  fingerprint: '',
};

function list(query: unknown): string[] {
  if (Array.isArray(query)) return query.map(String).filter(Boolean);
  if (typeof query === 'string') return query.split(',').filter(Boolean);
  return [];
}

function known<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return values.filter((value): value is T => (allowed as readonly string[]).includes(value));
}

export function parseLogFilters(query: Record<string, unknown>): LogFilters {
  const window = typeof query.window === 'string' && (WINDOWS as string[]).includes(query.window)
    ? (query.window as LogWindow)
    : EMPTY_LOG_FILTERS.window;
  return {
    levels: known(list(query.levels), LOG_LEVELS),
    categories: known(list(query.categories), LOG_CATEGORIES),
    sources: known(list(query.sources), LOG_SOURCES),
    window,
    text: typeof query.text === 'string' ? query.text : '',
    requestId: typeof query.requestId === 'string' ? query.requestId : '',
    fingerprint: typeof query.fingerprint === 'string' ? query.fingerprint : '',
  };
}

/** API query: the window becomes an absolute ISO bound so a reload keeps the same page. */
export function toLogQuery(filters: LogFilters, now = new Date()): LogQuery {
  const query: LogQuery = { limit: 50 };
  if (filters.levels.length) query.levels = [...filters.levels];
  if (filters.categories.length) query.categories = [...filters.categories];
  if (filters.sources.length) query.sources = [...filters.sources];
  if (filters.window !== 'all') {
    query.since = new Date(now.getTime() - WINDOW_MS[filters.window]).toISOString();
  }
  if (filters.text.trim()) query.text = filters.text.trim();
  if (filters.requestId.trim()) query.requestId = filters.requestId.trim();
  if (filters.fingerprint.trim()) query.fingerprint = filters.fingerprint.trim();
  return query;
}

/** Route query: short, shareable, and omitting defaults. */
export function filtersToRouteQuery(filters: LogFiltersInput): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.levels.length) query.levels = filters.levels.join(',');
  if (filters.categories.length) query.categories = filters.categories.join(',');
  if (filters.sources.length) query.sources = filters.sources.join(',');
  if (filters.window !== EMPTY_LOG_FILTERS.window) query.window = filters.window;
  if (filters.text.trim()) query.text = filters.text.trim();
  if (filters.requestId.trim()) query.requestId = filters.requestId.trim();
  if (filters.fingerprint.trim()) query.fingerprint = filters.fingerprint.trim();
  return query;
}

export function levelLabelKey(level: LogLevel): string {
  return `logs.levels.${level}`;
}
