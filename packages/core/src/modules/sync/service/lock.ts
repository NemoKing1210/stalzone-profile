import { WriteError } from '../../../platform/journal/index.js';

/**
 * Process-wide single flight. It lives in core because three callers share it:
 * the HTTP route, the in-process MCP client and the Nitro scheduler.
 */
let active: Promise<unknown> | null = null;

export function isSyncRunning(): boolean {
  return active !== null;
}

export async function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  if (active) throw new WriteError(409, 'SYNC_IN_PROGRESS', 'A sync is already running');
  const run = Promise.resolve().then(fn);
  active = run.then(
    () => undefined,
    () => undefined,
  );
  try {
    return await run;
  } finally {
    active = null;
  }
}

/** The scheduler skips a tick instead of failing it when a manual sync is running. */
export async function tryRunExclusive<T>(fn: () => Promise<T>): Promise<T | null> {
  if (active) return null;
  return runExclusive(fn);
}
