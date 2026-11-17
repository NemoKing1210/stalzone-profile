import { ClientLogEntrySchema, type LogLevel } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import {
  enqueueLog,
  flushLogs,
  readEffectiveLogging,
  shouldLog,
  type EffectiveLoggingSettings,
} from '../../../platform/logging/index.js';

export interface ClientIngestResult {
  accepted: number;
  rejected: number;
}

function accepts(settings: EffectiveLoggingSettings, level: LogLevel): boolean {
  return shouldLog(level, settings.levels.client);
}

/**
 * Browser batches are untrusted: each entry is validated alone, forced to
 * `client`/`client`, filtered by the client level and redacted by the writer.
 */
export function ingestClientLogs(db: Db, entries: unknown[], now = Date.now()): ClientIngestResult {
  const settings = readEffectiveLogging(db);
  if (!settings.enabled || !settings.captureClient) return { accepted: 0, rejected: 0 };

  let accepted = 0;
  let rejected = 0;
  for (const raw of entries) {
    const parsed = ClientLogEntrySchema.safeParse(raw);
    if (!parsed.success) {
      rejected += 1;
      continue;
    }
    const entry = parsed.data;
    if (!accepts(settings, entry.level)) continue;

    enqueueLog(db, {
      level: entry.level,
      category: 'client',
      source: 'client',
      message: entry.message,
      context: entry.context,
      stack: entry.stack ?? null,
      at: entry.at ?? new Date(now).toISOString(),
      requestId: entry.requestId ?? null,
    });
    accepted += 1;
  }

  // Make the 202 mean "durable", not "queued in memory".
  if (accepted > 0) flushLogs(db);
  return { accepted, rejected };
}
