import { LOG_CATEGORIES, type LogCategory, type LogLevel, type LogLevelOrOff, type LoggingSettingsUpdate } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import { DEFAULT_LOGGING_SETTINGS } from '../../../platform/logging/index.js';

/** Stored state, before the effective level map is derived. */
export interface StoredLoggingSettings {
  enabled: boolean;
  minLevel: LogLevel;
  retentionDays: number;
  maxRows: number;
  captureClient: boolean;
  clientConsole: boolean;
  mirrorStdout: boolean;
  overrides: Partial<Record<LogCategory, LogLevelOrOff>>;
  updatedAt: string;
}

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

export function readStoredSettings(db: Db): StoredLoggingSettings {
  const row = db.prepare(`SELECT * FROM log_setting WHERE id = 1`).get() as SettingRow | undefined;
  if (!row) {
    const defaults = DEFAULT_LOGGING_SETTINGS;
    return {
      enabled: defaults.enabled,
      minLevel: defaults.minLevel,
      retentionDays: defaults.retentionDays,
      maxRows: defaults.maxRows,
      captureClient: defaults.captureClient,
      clientConsole: defaults.clientConsole,
      mirrorStdout: defaults.mirrorStdout,
      overrides: {},
      updatedAt: defaults.updatedAt,
    };
  }

  const overrides: Partial<Record<LogCategory, LogLevelOrOff>> = {};
  for (const entry of db.prepare(`SELECT category, level FROM log_level`).all() as LevelRow[]) {
    overrides[entry.category] = entry.level;
  }

  return {
    enabled: row.enabled === 1,
    minLevel: row.min_level,
    retentionDays: row.retention_days,
    maxRows: row.max_rows,
    captureClient: row.capture_client === 1,
    clientConsole: row.client_console === 1,
    mirrorStdout: row.mirror_stdout === 1,
    overrides,
    updatedAt: row.updated_at,
  };
}

function writeScalars(db: Db, values: StoredLoggingSettings): void {
  db.prepare(
    `UPDATE log_setting
     SET enabled = @enabled, min_level = @min_level, retention_days = @retention_days,
         max_rows = @max_rows, capture_client = @capture_client, client_console = @client_console,
         mirror_stdout = @mirror_stdout, updated_at = @updated_at
     WHERE id = 1`,
  ).run({
    enabled: values.enabled ? 1 : 0,
    min_level: values.minLevel,
    retention_days: values.retentionDays,
    max_rows: values.maxRows,
    capture_client: values.captureClient ? 1 : 0,
    client_console: values.clientConsole ? 1 : 0,
    mirror_stdout: values.mirrorStdout ? 1 : 0,
    updated_at: values.updatedAt,
  });
}

function replaceOverrides(db: Db, overrides: Partial<Record<LogCategory, LogLevelOrOff>>, updatedAt: string): void {
  db.prepare(`DELETE FROM log_level`).run();
  const insert = db.prepare(`INSERT INTO log_level (category, level, updated_at) VALUES (?, ?, ?)`);
  for (const category of LOG_CATEGORIES) {
    const level = overrides[category];
    if (level) insert.run(category, level, updatedAt);
  }
}

/** Replaces the settings row and every override in the caller's transaction. */
export function writeSettingsTx(db: Db, input: LoggingSettingsUpdate, updatedAt = new Date().toISOString()): void {
  const overrides: Partial<Record<LogCategory, LogLevelOrOff>> = {};
  for (const category of LOG_CATEGORIES) {
    const level = input.levels[category];
    if (level !== 'inherit') overrides[category] = level;
  }
  writeScalars(db, {
    enabled: input.enabled,
    minLevel: input.minLevel,
    retentionDays: input.retentionDays,
    maxRows: input.maxRows,
    captureClient: input.captureClient,
    clientConsole: input.clientConsole,
    mirrorStdout: input.mirrorStdout,
    overrides,
    updatedAt,
  });
  replaceOverrides(db, overrides, updatedAt);
}

/** Restores a journal snapshot, including the original override set. */
export function restoreSettingsTx(db: Db, snapshot: StoredLoggingSettings): void {
  writeScalars(db, snapshot);
  replaceOverrides(db, snapshot.overrides, snapshot.updatedAt);
}
