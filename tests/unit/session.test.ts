import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from '@dossier/core';

const SECRET = 'unit-test-session-secret-at-least-32-chars';
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);

describe('session token', () => {
  it('round-trips a signed owner token', () => {
    const token = createSessionToken(SECRET, NOW, 60_000);
    expect(token).toMatch(/^owner\.\d+\.[A-Za-z0-9_-]+$/);
    expect(verifySessionToken(token, SECRET, NOW + 30_000)).toBeGreaterThan(NOW);
  });

  it('rejects an expired token', () => {
    const token = createSessionToken(SECRET, NOW, 60_000);
    expect(verifySessionToken(token, SECRET, NOW + 61_000)).toBeNull();
  });

  it('rejects a token signed with another secret', () => {
    const token = createSessionToken(SECRET, NOW, 60_000);
    expect(verifySessionToken(token, `${SECRET}-other`, NOW)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = createSessionToken(SECRET, NOW, 60_000);
    const [owner, , sig] = token.split('.');
    expect(verifySessionToken(`${owner}.${NOW + 999_999}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifySessionToken('', SECRET, NOW)).toBeNull();
    expect(verifySessionToken('owner.abc.def', SECRET, NOW)).toBeNull();
    expect(verifySessionToken('user.123.sig', SECRET, NOW)).toBeNull();
    expect(verifySessionToken('owner.123.$$$', SECRET, NOW)).toBeNull();
  });
});
