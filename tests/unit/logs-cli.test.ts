import { describe, expect, it } from 'vitest';
import { formatLogs, parseLogsArgs } from '../../scripts/logs';

describe('logs CLI', () => {
  it('parses flags into a query', () => {
    expect(parseLogsArgs(['--level=error', '--category=sync', '--since=24h', '--limit=10'])).toEqual({
      stats: false,
      json: false,
      query: { levels: ['error'], categories: ['sync'], since: expect.any(String), limit: 10 },
    });
  });

  it('rejects an unknown level', () => {
    expect(() => parseLogsArgs(['--level=fatal'])).toThrow(/unknown level/);
  });

  it('formats a compact table and JSON', () => {
    const rows = [{ id: 1, at: '2026-11-17T10:00:00.000Z', level: 'error', category: 'sync', message: 'boom' }];
    expect(formatLogs(rows as never)).toContain('error');
    expect(JSON.stringify(rows)).toContain('boom');
  });
});
