import { describe, expect, it } from 'vitest';
import { httpLogLevel, shouldLogHttpPath } from '../../server/utils/http-log';

describe('http log classification', () => {
  it('maps status and duration to a level', () => {
    expect(httpLogLevel(500, 10)).toBe('error');
    expect(httpLogLevel(422, 10)).toBe('warn');
    expect(httpLogLevel(401, 10)).toBe('info');
    expect(httpLogLevel(404, 10)).toBe('info');
    expect(httpLogLevel(200, 1500)).toBe('info');
    expect(httpLogLevel(200, 20)).toBe('debug');
  });

  it('excludes framework assets and the client ingest route', () => {
    for (const path of ['/_nuxt/a.js', '/icons/x.png', '/favicon.ico', '/audio/a.mp3', '/api/v1/logs/client']) {
      expect(shouldLogHttpPath(path), path).toBe(false);
    }
    expect(shouldLogHttpPath('/api/v1/items')).toBe(true);
  });
});
