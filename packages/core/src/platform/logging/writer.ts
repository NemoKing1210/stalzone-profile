import type { LogCategory, LogSource } from '@profile/shared/contracts';
import type { Db } from '../db/index.js';
import { flushDelayFor, isQueueFull, shouldDrop } from './backpressure.js';
import { fingerprintOf } from './fingerprint.js';
import { resolveLevel, shouldLog } from './levels.js';
import { sanitizeRecord } from './redact.js';
import { readEffectiveLogging } from './settings.js';
import type { LogContextOptions, LogRecord, Logger, SanitizedRecord } from './types.js';

const HOOKS_KEY = '__profileLoggingHooks';
interface InstalledHooks {
  uncaught: (error: Error) => void;
  rejection: (reason: unknown) => void;
  exit: () => void;
}

interface LoggerState {
  db: Db;
  source: LogSource;
  queue: SanitizedRecord[];
  timer: NodeJS.Timeout | null;
  dueAt: number | null;
  dropped: number;
  dropping: boolean;
  insert: ReturnType<Db['prepare']> | null;
}

let states = new WeakMap<Db, LoggerState>();
const liveStates = new Set<LoggerState>();

function ensureState(db: Db, source: LogSource = 'server'): LoggerState {
  let state = states.get(db);
  if (!state) {
    state = { db, source, queue: [], timer: null, dueAt: null, dropped: 0, dropping: false, insert: null };
    states.set(db, state);
    liveStates.add(state);
  }
  return state;
}

function stackOf(cause: unknown): string | null {
  return cause instanceof Error ? (cause.stack ?? null) : null;
}

function contextOf(cause: unknown): Record<string, unknown> | null {
  if (!(cause instanceof Error)) return null;
  return { errorName: cause.name, errorMessage: cause.message };
}

function mirror(record: SanitizedRecord, mirrorStdout: boolean): void {
  const isError = record.level === 'error' || record.level === 'warn';
  if (!mirrorStdout && !isError) return;
  const details = record.context == null ? '' : ` ${JSON.stringify(record.context)}`;
  const line = `[${record.level}] [${record.category}] ${record.message}${details}`;
  if (isError) console.error(line);
  else console.log(line);
}

/**
 * Earliest-due scheduling: a later record must never postpone an earlier,
 * more urgent flush. An error scheduled for now keeps its zero-delay timer
 * even when info entries keep arriving.
 */
function schedule(state: LoggerState, delayMs: number): void {
  const dueAt = Date.now() + delayMs;
  if (state.timer && state.dueAt != null && state.dueAt <= dueAt) return;
  if (state.timer) clearTimeout(state.timer);
  state.dueAt = dueAt;
  state.timer = setTimeout(() => {
    state.timer = null;
    state.dueAt = null;
    flushLogs(state.db);
  }, delayMs);
  state.timer.unref?.();
}

/** Queues one record. Never throws and never touches SQLite synchronously. */
export function enqueueLog(db: Db, record: LogRecord): void {
  try {
    const settings = readEffectiveLogging(db);
    const state = ensureState(db, record.source);

    if (!settings.enabled) {
      if (record.level === 'error') {
        console.error(`[error] [${record.category}] ${record.message}`);
      }
      return;
    }

    const effective = resolveLevel(settings, record.category);
    if (!shouldLog(record.level, effective)) return;

    const full = isQueueFull(state.queue.length);
    if (shouldDrop(record.level, state.queue.length)) {
      state.dropped += 1;
      if (!state.dropping) {
        state.dropping = true;
        if (full) {
          // No room for a summary row: say it on stderr once per episode.
          console.error(`[logging] queue full at ${state.queue.length} entries; dropping logs`);
        } else {
          state.queue.push(
            sanitizeRecord({
              level: 'warn',
              category: 'app',
              message: 'log entries dropped under load',
              context: { queued: state.queue.length },
              source: state.source,
            }),
          );
        }
      }
      return;
    }
    if (state.dropping) state.dropping = false;

    const sanitized = sanitizeRecord({ ...record, source: record.source ?? state.source });
    state.queue.push(sanitized);
    mirror(sanitized, settings.mirrorStdout);
    schedule(state, flushDelayFor(record.level, state.queue.length));
  } catch {
    /* logging must never break the caller */
  }
}

/** Inserts the queued batch. Returns the number of written rows; never throws. */
export function flushLogs(db: Db): number {
  const state = states.get(db);
  if (!state || state.queue.length === 0) return 0;
  if (db.inTransaction) {
    schedule(state, 25);
    return 0;
  }
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
    state.dueAt = null;
  }

  const batch = state.queue.splice(0, state.queue.length);
  try {
    state.insert ??= db.prepare(
      `INSERT INTO log_entry (at, level, category, source, message, context, stack, request_id, fingerprint, duration_ms)
       VALUES (@at, @level, @category, @source, @message, @context, @stack, @request_id, @fingerprint, @duration_ms)`,
    );
    const insert = state.insert;
    db.transaction(() => {
      for (const entry of batch) {
        insert.run({
          at: entry.at ?? new Date().toISOString(),
          level: entry.level,
          category: entry.category,
          source: entry.source ?? state.source,
          message: entry.message,
          context: entry.context == null ? null : JSON.stringify(entry.context),
          stack: entry.stack,
          request_id: entry.requestId,
          fingerprint: fingerprintOf(entry.level, entry.category, entry.message, entry.stack),
          duration_ms: entry.durationMs,
        });
      }
    })();
    return batch.length;
  } catch (error) {
    state.dropped += batch.length;
    console.error('[logging] flush failed', error instanceof Error ? error.message : String(error));
    return 0;
  }
}

export function getQueueState(db: Db): { queued: number; dropped: number } {
  const state = states.get(db);
  return { queued: state?.queue.length ?? 0, dropped: state?.dropped ?? 0 };
}

function allStates(): LoggerState[] {
  return [...liveStates];
}

function installProcessHooks(): void {
  const globals = globalThis as typeof globalThis & { [HOOKS_KEY]?: InstalledHooks };
  if (globals[HOOKS_KEY]) return;

  const uncaught: InstalledHooks['uncaught'] = (error) => {
    for (const state of allStates()) {
      enqueueLog(state.db, {
        level: 'error',
        category: 'app',
        message: 'uncaught exception',
        context: contextOf(error),
        stack: stackOf(error),
        source: state.source,
      });
      flushLogs(state.db);
    }
  };

  const rejection: InstalledHooks['rejection'] = (reason) => {
    for (const state of allStates()) {
      enqueueLog(state.db, {
        level: 'error',
        category: 'app',
        message: 'unhandled rejection',
        context: contextOf(reason),
        stack: stackOf(reason),
        source: state.source,
      });
      flushLogs(state.db);
    }
    // Preserve Node's default crash semantics.
    setImmediate(() => {
      throw reason;
    });
  };

  const exit: InstalledHooks['exit'] = () => {
    for (const state of allStates()) flushLogs(state.db);
  };

  globals[HOOKS_KEY] = { uncaught, rejection, exit };
  process.on('uncaughtExceptionMonitor', uncaught);
  process.on('unhandledRejection', rejection);
  process.on('exit', exit);
}

export interface InitLoggingOptions {
  source?: LogSource;
  processHooks?: boolean;
}

export function initLogging(db: Db, options: InitLoggingOptions = {}): void {
  const state = ensureState(db, options.source ?? 'server');
  state.source = options.source ?? 'server';
  if (options.processHooks !== false) installProcessHooks();
}

function makeLogger(db: Db, category: LogCategory, options: LogContextOptions): Logger {
  function write(
    level: SanitizedRecord['level'],
    message: string,
    context?: unknown,
    cause?: unknown,
    durationMs?: number,
  ): void {
    const errorContext = contextOf(cause);
    enqueueLog(db, {
      level,
      category,
      message,
      context: errorContext ? { ...(typeof context === 'object' && context ? context : {}), ...errorContext } : context,
      stack: stackOf(cause),
      requestId: options.requestId ?? null,
      durationMs: durationMs ?? null,
      source: options.source,
    });
  }

  return {
    debug: (message, context, cause, durationMs) => write('debug', message, context, cause, durationMs),
    info: (message, context, cause, durationMs) => write('info', message, context, cause, durationMs),
    warn: (message, context, cause, durationMs) => write('warn', message, context, cause, durationMs),
    error: (message, context, cause, durationMs) => write('error', message, context, cause, durationMs),
    child: (extra) => makeLogger(db, category, { ...options, ...extra }),
  };
}

export function getLogger(
  db: Db,
  category: LogCategory,
  options: LogContextOptions = {},
): Logger {
  return makeLogger(db, category, options);
}

export function shutdownLogging(db: Db): void {
  flushLogs(db);
  const state = states.get(db);
  if (state?.timer) clearTimeout(state.timer);
  if (state) liveStates.delete(state);
  states.delete(db);
}

/** Test helper: drop queues, timers and the hooks guard. */
export function resetLoggingForTests(): void {
  for (const state of allStates()) {
    if (state.timer) clearTimeout(state.timer);
  }
  liveStates.clear();
  states = new WeakMap();
  const globals = globalThis as typeof globalThis & { [HOOKS_KEY]?: InstalledHooks };
  const hooks = globals[HOOKS_KEY];
  if (hooks) {
    process.off('uncaughtExceptionMonitor', hooks.uncaught);
    process.off('unhandledRejection', hooks.rejection);
    process.off('exit', hooks.exit);
    globals[HOOKS_KEY] = undefined;
  }
}
