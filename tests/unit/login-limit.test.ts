import { describe, expect, it } from 'vitest';
import { loginClientKey } from '@dossier/core';

describe('loginClientKey', () => {
  it('uses the socket address by default', () => {
    expect(loginClientKey('10.0.0.7', '203.0.113.9', false)).toBe('10.0.0.7');
  });

  it('ignores a spoofed X-Forwarded-For when the proxy is not trusted', () => {
    expect(loginClientKey('10.0.0.7', '198.51.100.1, 10.0.0.7', false)).toBe('10.0.0.7');
  });

  it('takes the first forwarded address behind a trusted proxy', () => {
    expect(loginClientKey('172.18.0.2', '198.51.100.1, 10.0.0.7', true)).toBe('198.51.100.1');
  });

  it('falls back to unknown without an address', () => {
    expect(loginClientKey(null, undefined, false)).toBe('unknown');
    expect(loginClientKey('  ', '', true)).toBe('unknown');
  });
});
