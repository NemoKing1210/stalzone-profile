import type { LogCategory, LogLevel, LogLevelOrOff, LogSource } from '@profile/shared/contracts';

/** A record on its way into the queue, before settings, redaction and stamping. */
export interface LogRecord {
  level: LogLevel;
  category: LogCategory;
  message: string;
  context?: unknown;
  stack?: string | null;
  requestId?: string | null;
  durationMs?: number | null;
  at?: string;
  source?: LogSource;
}

/** Ambient fields shared by a logger and its children. */
export interface LogContextOptions {
  source?: LogSource;
  requestId?: string | null;
}

export interface Logger {
  debug(message: string, context?: unknown, cause?: unknown, durationMs?: number): void;
  info(message: string, context?: unknown, cause?: unknown, durationMs?: number): void;
  warn(message: string, context?: unknown, cause?: unknown, durationMs?: number): void;
  error(message: string, context?: unknown, cause?: unknown, durationMs?: number): void;
  child(options: LogContextOptions): Logger;
}

/** What the writer needs after filtering, redaction and truncation. */
export interface SanitizedRecord {
  level: LogLevel;
  category: LogCategory;
  message: string;
  context: unknown;
  stack: string | null;
  requestId: string | null;
  durationMs: number | null;
  at?: string;
  source?: LogSource;
}

export interface EffectiveLoggingSettings {
  enabled: boolean;
  minLevel: LogLevel;
  retentionDays: number;
  maxRows: number;
  captureClient: boolean;
  clientConsole: boolean;
  mirrorStdout: boolean;
  levels: Record<LogCategory, LogLevelOrOff>;
  updatedAt: string;
}
