import type { LogLevel } from '@profile/shared/contracts';

const SLOW_MS = 1_000;

/**
 * 5xx is an error; 4xx is a warning except the expected client noise (401 and 404);
 * a slow successful request is worth `info` even when it succeeded.
 */
export function httpLogLevel(status: number, durationMs: number): LogLevel {
  if (status >= 500) return 'error';
  if (status === 401 || status === 404) return 'info';
  if (status >= 400) return 'warn';
  if (durationMs >= SLOW_MS) return 'info';
  return 'debug';
}

const IGNORED_PATHS = new Set(['/favicon.ico', '/api/v1/logs/client']);

/** Framework assets and the client ingest route would only flood the log. */
export function shouldLogHttpPath(pathname: string): boolean {
  if (IGNORED_PATHS.has(pathname)) return false;
  for (const prefix of ['/_', '/icons/', '/audio/', '/favicon']) {
    if (pathname.startsWith(prefix)) return false;
  }
  return true;
}
