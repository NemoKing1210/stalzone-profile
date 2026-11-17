import {
  LOG_CATEGORIES,
  LoggingSettingsUpdateSchema,
  PurgeLogsSchema,
  type LogCategory,
  type LoggingSettings,
  type LoggingSettingsUpdate,
  type PurgeLogsInput,
  type PurgeLogsValues,
  type WriteResult,
} from '@profile/shared/contracts';
import type { Db } from '../../platform/db/index.js';
import { logEvent, withTransaction, WriteError } from '../../platform/journal/index.js';
import { invalidateLoggingSettings } from '../../platform/logging/index.js';
import { buildWhere, type LogFilter } from './repo/entries.js';
import { restoreSettingsTx, writeSettingsTx, type StoredLoggingSettings } from './repo/settings.js';
import { readLoggingSettings } from './service/settings.js';

function viewOf(input: LoggingSettingsUpdate, updatedAt: string): LoggingSettings {
  const overrides: Partial<Record<LogCategory, LoggingSettings['levels'][LogCategory]>> = {};
  const levels = Object.fromEntries(
    LOG_CATEGORIES.map((category) => {
      const level = input.levels[category];
      if (level === 'inherit') return [category, input.minLevel];
      overrides[category] = level;
      return [category, level];
    }),
  ) as LoggingSettings['levels'];

  return {
    enabled: input.enabled,
    minLevel: input.minLevel,
    retentionDays: input.retentionDays,
    maxRows: input.maxRows,
    captureClient: input.captureClient,
    clientConsole: input.clientConsole,
    mirrorStdout: input.mirrorStdout,
    levels,
    overrides,
    updatedAt,
  };
}

function human(settings: LoggingSettings): string {
  const state = settings.enabled ? 'enabled' : 'disabled';
  return `Logging ${state}: level ${settings.minLevel}, retention ${settings.retentionDays} d, cap ${settings.maxRows} rows`;
}

function sameSettings(before: LoggingSettings, after: LoggingSettings): boolean {
  return (
    JSON.stringify({ ...before, updatedAt: null }) === JSON.stringify({ ...after, updatedAt: null })
  );
}

/** Owner settings write: replaces the stored settings and records one audit event. */
export function updateLoggingSettings(db: Db, input: LoggingSettingsUpdate): WriteResult {
  const parsed = LoggingSettingsUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new WriteError(422, 'INVALID_LOGGING_SETTINGS', 'Invalid logging settings', parsed.error.issues);
  }

  const before = readLoggingSettings(db);
  const after = viewOf(parsed.data, new Date().toISOString());
  const diff = { before, after, human: human(after) };

  if (sameSettings(before, after)) return { dryRun: parsed.data.dryRun, diff };
  if (parsed.data.dryRun) return { dryRun: true, diff };

  let eventId: number | undefined;
  withTransaction(db, () => {
    writeSettingsTx(db, parsed.data);
    invalidateLoggingSettings(db);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'logging.settings.update',
      entity: 'logging',
      entityId: 1,
      before,
      after,
    });
  });

  return { dryRun: false, diff, eventId };
}

/** Rollback entry point for `maintenance`: restores the journal snapshot. */
export function restoreLoggingSettingsTx(db: Db, snapshot: LoggingSettings): void {
  const stored: StoredLoggingSettings = {
    enabled: snapshot.enabled,
    minLevel: snapshot.minLevel,
    retentionDays: snapshot.retentionDays,
    maxRows: snapshot.maxRows,
    captureClient: snapshot.captureClient,
    clientConsole: snapshot.clientConsole,
    mirrorStdout: snapshot.mirrorStdout,
    overrides: snapshot.overrides,
    updatedAt: snapshot.updatedAt,
  };
  restoreSettingsTx(db, stored);
  invalidateLoggingSettings(db);
}

function purgeTarget(values: PurgeLogsValues): LogFilter {
  if (values.scope === 'all') return {};
  const filter = values.filter ?? {};
  // An explicit key with an empty value (`levels: []`, all-undefined from MCP)
  // contributes no SQL predicate, so it would delete every row. Ask the
  // predicate builder, not the key count.
  if (buildWhere(filter).sql === '') {
    throw new WriteError(422, 'LOG_FILTER_REQUIRED', 'A filtered purge needs at least one filter; use scope "all" to clear every log');
  }
  return filter;
}

/** Owner purge: deletes the filtered set and records one non-rollbackable event. */
export function purgeLogs(db: Db, input: PurgeLogsInput): WriteResult {
  const parsed = PurgeLogsSchema.safeParse(input);
  if (!parsed.success) {
    throw new WriteError(422, 'INVALID_LOG_PURGE', 'Invalid log purge request', parsed.error.issues);
  }

  const values = parsed.data;
  const filter = purgeTarget(values);
  const where = buildWhere(filter);
  const count = (db.prepare(`SELECT COUNT(*) AS c FROM log_entry ${where.sql}`).get(...where.params) as { c: number }).c;
  const diff = {
    before: { count, filter },
    after: null,
    human: `Purge ${count} log entr${count === 1 ? 'y' : 'ies'} (${values.scope})`,
  };

  if (values.dryRun) return { dryRun: true, diff };

  let eventId: number | undefined;
  withTransaction(db, () => {
    db.prepare(`DELETE FROM log_entry ${where.sql}`).run(...where.params);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'log.clear',
      entity: 'log',
      entityId: 'all',
      before: diff.before,
      after: null,
    });
  });

  return { dryRun: false, diff, eventId };
}
