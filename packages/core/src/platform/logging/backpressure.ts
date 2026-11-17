import type { LogLevel } from '@profile/shared/contracts';

/** Level backpressure: drop debug first, then info, before the queue is full. */
export const QUEUE_LIMITS = { debug: 5000, info: 10000 } as const;

/** Absolute queue cap: above it even warn and error are dropped. */
export const QUEUE_HARD_LIMIT = 10000;

/** Batch size that forces an immediate flush for batched levels. */
export const FLUSH_AFTER_ENTRIES = 200;

/** Normal batching delay for debug/info. */
export const FLUSH_INTERVAL_MS = 1000;

export interface QueueLimits {
  debug: number;
  info: number;
}

/** Levels to drop at the current queue depth: debug first, then info; never warn/error. */
export function backpressureLevels(queued: number, limits: QueueLimits = QUEUE_LIMITS): LogLevel[] {
  if (queued >= limits.info) return ['debug', 'info'];
  if (queued >= limits.debug) return ['debug'];
  return [];
}

/** True when the queue cannot accept any further record, whatever its level. */
export function isQueueFull(queued: number, limit = QUEUE_HARD_LIMIT): boolean {
  return queued >= limit;
}

/** The drop rule the writer applies: level backpressure first, hard cap last. */
export function shouldDrop(level: LogLevel, queued: number): boolean {
  return isQueueFull(queued) || backpressureLevels(queued).includes(level);
}

/**
 * Delay before the writer flushes this record. Warn/error never wait; a full
 * batch flushes at once, so sustained info traffic cannot postpone a flush.
 */
export function flushDelayFor(level: LogLevel, queued: number): number {
  if (level === 'warn' || level === 'error') return 0;
  if (queued >= FLUSH_AFTER_ENTRIES) return 0;
  return FLUSH_INTERVAL_MS;
}
