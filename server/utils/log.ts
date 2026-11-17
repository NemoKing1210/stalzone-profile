import type { H3Event } from 'h3';
import type { LogCategory, LogLevel } from '@profile/shared/contracts';
import { getLogger, type Logger } from '@profile/core';
import { useDb } from './db';

/** A logger bound to the current request, so every line carries its `requestId`. */
export function requestLogger(event: H3Event, category: LogCategory): Logger {
  return getLogger(useDb(), category, {
    source: 'server',
    requestId: (event.context.requestId as string | undefined) ?? null,
  });
}

/** Level-agnostic helper for call sites that pick a level at runtime. */
export function logAt(
  logger: Logger,
  level: LogLevel,
  message: string,
  context?: unknown,
  durationMs?: number,
): void {
  logger[level](message, context, undefined, durationMs);
}
