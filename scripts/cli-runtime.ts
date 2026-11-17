import { flushLogs, initLogging, type Db } from '@profile/core';

/**
 * CLI processes own their logging state like the server does, but they are
 * short-lived: no process hooks, and the command must flush before it exits.
 */
export function attachCliLogging(db: Db): void {
  initLogging(db, { source: 'cli', processHooks: false });
}

/** Best-effort flush for the command's final messages. */
export function flushCliLogging(db: Db | null): void {
  if (db?.open) flushLogs(db);
}
