import { describe, expect, it } from 'vitest';
import {
  ClientLogBatchSchema,
  NON_ROLLBACKABLE_ACTIONS,
  LogQueryParamsSchema,
  LogQuerySchema,
  LoggingSettingsUpdateSchema,
  PurgeLogsSchema,
} from '@profile/shared/contracts';

describe('logging contracts', () => {
  it('defaults a query to 50 entries and rejects an unknown level', () => {
    expect(LogQuerySchema.parse({}).limit).toBe(50);
    expect(LogQuerySchema.safeParse({ levels: ['fatal'] }).success).toBe(false);
  });

  it('parses comma-separated query parameters', () => {
    expect(LogQueryParamsSchema.parse({ levels: 'warn,error', categories: 'sync,http', limit: '10' })).toEqual({
      levels: ['warn', 'error'],
      categories: ['sync', 'http'],
      limit: 10,
    });
  });

  it('requires all six categories in a settings update and defaults dryRun to false', () => {
    const base = {
      enabled: true,
      minLevel: 'info',
      retentionDays: 14,
      maxRows: 200000,
      captureClient: true,
      clientConsole: false,
      mirrorStdout: true,
    };
    expect(LoggingSettingsUpdateSchema.safeParse(base).success).toBe(false);
    const parsed = LoggingSettingsUpdateSchema.parse({
      ...base,
      levels: { http: 'inherit', sync: 'debug', mcp: 'inherit', db: 'inherit', app: 'inherit', client: 'off' },
    });
    expect(parsed.dryRun).toBe(false);
    expect(parsed.levels.http).toBe('inherit');
  });

  it('rejects a retention outside 1..365 and a purge scope other than all/filtered', () => {
    const base = {
      enabled: true,
      minLevel: 'info',
      retentionDays: 0,
      maxRows: 200000,
      captureClient: true,
      clientConsole: false,
      mirrorStdout: true,
      levels: { http: 'inherit', sync: 'inherit', mcp: 'inherit', db: 'inherit', app: 'inherit', client: 'inherit' },
    };
    expect(LoggingSettingsUpdateSchema.safeParse(base).success).toBe(false);
    expect(PurgeLogsSchema.safeParse({ scope: 'everything' }).success).toBe(false);
    expect(PurgeLogsSchema.parse({ scope: 'all' })).toEqual({ scope: 'all', dryRun: false });
  });

  it('accepts a browser batch as an envelope so entries are validated one by one', () => {
    const parsed = ClientLogBatchSchema.safeParse({
      entries: [{ level: 'error', message: 'ok' }, { level: 'fatal', message: 'bad' }],
    });
    expect(parsed.success).toBe(true);
    expect(ClientLogBatchSchema.safeParse({ entries: [] }).success).toBe(false);
    expect(
      ClientLogBatchSchema.safeParse({
        entries: Array.from({ length: 51 }, () => ({ level: 'info', message: 'x' })),
      }).success,
    ).toBe(false);
  });

  it('marks log.clear as non-rollbackable', () => {
    expect(NON_ROLLBACKABLE_ACTIONS).toContain('log.clear');
  });
});
