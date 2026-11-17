import { describe, expect, it } from 'vitest';
import { hostOf, isSameOrigin, normalizedHost } from '../../server/utils/origin';

describe('origin comparison', () => {
  it('normalizes casing, whitespace and default ports', () => {
    expect(normalizedHost(' Example.COM:443 ')).toBe('example.com');
    expect(normalizedHost('example.com:80')).toBe('example.com');
    expect(normalizedHost('example.com:8443')).toBe('example.com:8443');
    expect(normalizedHost('')).toBe('');
  });

  it('extracts the host from a URL and rejects malformed origins', () => {
    expect(hostOf('https://Example.com:8443/path?q=1')).toBe('example.com:8443');
    expect(hostOf('not a url')).toBe('');
    expect(hostOf('')).toBe('');
  });

  it('matches only the same host, including the port', () => {
    expect(isSameOrigin('https://example.com', 'example.com')).toBe(true);
    expect(isSameOrigin('https://example.com:443', 'EXAMPLE.com')).toBe(true);
    expect(isSameOrigin('http://example.com:80', 'example.com:8080')).toBe(false);
    expect(isSameOrigin('https://evil.example.com', 'example.com')).toBe(false);
    expect(isSameOrigin('https://example.com.evil.test', 'example.com')).toBe(false);
    expect(isSameOrigin('https://example.com@evil.test', 'example.com')).toBe(false);
    expect(isSameOrigin('null', 'example.com')).toBe(false);
    expect(isSameOrigin('', 'example.com')).toBe(false);
  });
});
