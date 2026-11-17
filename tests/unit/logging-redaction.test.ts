import { describe, expect, it } from 'vitest';
import {
  fingerprintOf,
  redactContext,
  redactText,
  resolveLevel,
  sanitizeRecord,
  shouldLog,
} from '@profile/core';

describe('redaction', () => {
  it('strips query strings from URLs in text', () => {
    expect(redactText('GET https://example.com/api/items?token=secret&x=1 failed')).toBe(
      'GET https://example.com/api/items?… failed',
    );
    expect(redactText('open /api/v1/items?q=private')).toBe('open /api/v1/items?…');
    // A path-with-query does not need whitespace before it: `url=…` in a
    // message or stack is the same leak.
    expect(redactText('url=/api/v1/items?token=abc')).toBe('url=/api/v1/items?…');
    expect(redactText('at https://example.com/x?token=abc')).toBe('at https://example.com/x?…');
  });

  it('redacts credential keys recursively and bearer values', () => {
    expect(redactContext({ password: 'p', nested: { authorization: 'Bearer abc.def' }, list: ['ok'] })).toEqual({
      password: '[redacted]',
      nested: { authorization: '[redacted]' },
      list: ['ok'],
    });
    expect(redactText('authorization: Bearer abc.def')).toBe('authorization: Bearer [redacted]');
  });

  it('caps message, stack and context before fingerprinting', () => {
    const entry = sanitizeRecord({
      level: 'error',
      category: 'app',
      message: 'x'.repeat(5000),
      stack: 'y'.repeat(9000),
      context: { blob: 'z'.repeat(3000) },
    });
    expect(Buffer.byteLength(entry.message)).toBeLessThanOrEqual(4096);
    expect(Buffer.byteLength(entry.stack!)).toBeLessThanOrEqual(8192);
    expect(Buffer.byteLength(JSON.stringify(entry.context))).toBeLessThanOrEqual(16384);
  });
});

describe('levels and fingerprints', () => {
  it('applies the category override before the global level', () => {
    const settings = { minLevel: 'info', levels: { http: 'debug', sync: 'off', mcp: 'warn' } };
    expect(resolveLevel(settings as never, 'http')).toBe('debug');
    expect(resolveLevel(settings as never, 'sync')).toBe('off');
    expect(resolveLevel(settings as never, 'app')).toBe('info');
    expect(shouldLog('debug', 'info')).toBe(false);
    expect(shouldLog('error', 'info')).toBe(true);
    expect(shouldLog('error', 'off')).toBe(false);
  });

  it('collapses whitespace and ignores the first stack line for the fingerprint', () => {
    const a = fingerprintOf('error', 'app', 'boom   here', 'Error: boom\n  at a.ts:1:1');
    const b = fingerprintOf('error', 'app', 'boom here', 'Error: boom\n  at a.ts:1:1');
    const c = fingerprintOf('error', 'app', 'boom here', 'Error: other\n  at a.ts:1:1');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{40}$/);
  });
});
