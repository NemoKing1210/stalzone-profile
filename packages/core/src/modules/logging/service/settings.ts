import {
  LOG_CATEGORIES,
  type LogCategory,
  type LoggingSettings,
  type LogLevelOrOff,
} from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import { readStoredSettings } from '../repo/settings.js';

/** The API view: stored scalars, effective levels and only the explicit overrides. */
export function readLoggingSettings(db: Db): LoggingSettings {
  const stored = readStoredSettings(db);
  const levels = Object.fromEntries(
    LOG_CATEGORIES.map((category) => [category, stored.overrides[category] ?? stored.minLevel]),
  ) as Record<LogCategory, LogLevelOrOff>;

  return {
    enabled: stored.enabled,
    minLevel: stored.minLevel,
    retentionDays: stored.retentionDays,
    maxRows: stored.maxRows,
    captureClient: stored.captureClient,
    clientConsole: stored.clientConsole,
    mirrorStdout: stored.mirrorStdout,
    levels,
    overrides: stored.overrides,
    updatedAt: stored.updatedAt,
  };
}
