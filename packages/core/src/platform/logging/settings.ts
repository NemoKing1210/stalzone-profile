import {
  LOG_CATEGORIES,
  type LogCategory,
  type LogLevel,
  type LogLevelOrOff,
} from '@profile/shared/contracts';
import type { Db } from '../db/index.js';
import type { EffectiveLoggingSettings } from './types.js';

const TTL_MS = 5000;

/** Fallback used before migration 0007 and when the database cannot be read. */
export const DEFAULT_LOGGING_SETTINGS: EffectiveLoggingSettings = {
  enabled: true,
  minLevel: 'info',
  retentionDays: 14,
  maxRows: 200_000,
  captureClient: true,
  clientConsole: false,
  mirrorStdout: true,
  levels: { http: 'info', sync: 'info', mcp: 'info', db: 'info', app: 'info', client: 'info' },
  updatedAt: '1970-01-01T00:00:00.000Z',
};

interface SettingRow {
  enabled: number;
  min_level: LogLevel;
  retention_days: number;
  max_rows: number;
  capture_client: number;
  client_console: number;
  mirror_stdout: number;
  updated_at: string;
}

interface LevelRow {
  category: LogCategory;
  level: LogLevelOrOff;
}

const cache = new WeakMap<Db, { at: number; settings: EffectiveLoggingSettings }>();

/** Effective settings: the global level plus per-category overrides, cached for five seconds. */
export function readEffectiveLogging(db: Db, now = Date.now()): EffectiveLoggingSettings {
  const cached = cache.get(db);
  if (cached && now - cached.at < TTL_MS) return cached.settings;

  let settings: EffectiveLoggingSettings;
  try {
    const row = db
      .prepare(
        `SELECT enabled, min_level, retention_days, max_rows, capture_client, client_console,
                mirror_stdout, updated_at
         FROM log_setting WHERE id = 1`,
      )
      .get() as SettingRow | undefined;
    if (!row) {
      settings = DEFAULT_LOGGING_SETTINGS;
    } else {
      const overrides = new Map(
        (db.prepare(`SELECT category, level FROM log_level`).all() as LevelRow[]).map((entry) => [
          entry.category,
          entry.level,
        ]),
      );
      const levels = Object.fromEntries(
        LOG_CATEGORIES.map((category) => [category, overrides.get(category) ?? row.min_level]),
      ) as Record<LogCategory, LogLevelOrOff>;
      settings = {
        enabled: row.enabled === 1,
        minLevel: row.min_level,
        retentionDays: row.retention_days,
        maxRows: row.max_rows,
        captureClient: row.capture_client === 1,
        clientConsole: row.client_console === 1,
        mirrorStdout: row.mirror_stdout === 1,
        levels,
        updatedAt: row.updated_at,
      };
    }
  } catch {
    settings = DEFAULT_LOGGING_SETTINGS;
  }

  cache.set(db, { at: now, settings });
  return settings;
}

export function invalidateLoggingSettings(db: Db): void {
  cache.delete(db);
}
