import { describe, expect, it } from 'vitest';
import { shouldLeaveSetup, shouldRedirectToSetup } from '../../server/utils/setup-redirect';

const base = { method: 'GET', accept: 'text/html', authenticated: true, hasCharacter: false };

describe('shouldRedirectToSetup', () => {
  it('redirects an authenticated HTML navigation without a character', () => {
    expect(shouldRedirectToSetup({ ...base, path: '/' })).toBe(true);
    expect(shouldRedirectToSetup({ ...base, path: '/weapons?x=1' })).toBe(true);
  });

  it('never redirects setup, login, api, framework, icon or non-GET/non-HTML requests', () => {
    for (const path of ['/setup', '/login', '/api/v1/payload', '/_nuxt/app.js', '/icons/x.png', '/favicon.ico']) {
      expect(shouldRedirectToSetup({ ...base, path }), path).toBe(false);
    }
    expect(shouldRedirectToSetup({ ...base, path: '/', method: 'POST' })).toBe(false);
    expect(shouldRedirectToSetup({ ...base, path: '/', accept: 'application/json' })).toBe(false);
    expect(shouldRedirectToSetup({ ...base, path: '/', authenticated: false })).toBe(false);
  });

  it('does not redirect when a character exists', () => {
    expect(shouldRedirectToSetup({ ...base, path: '/', hasCharacter: true })).toBe(false);
  });
});

describe('shouldLeaveSetup', () => {
  it('sends a set-up owner away from /setup', () => {
    expect(shouldLeaveSetup({ path: '/setup', hasCharacter: true })).toBe(true);
    expect(shouldLeaveSetup({ path: '/setup', hasCharacter: false })).toBe(false);
    expect(shouldLeaveSetup({ path: '/', hasCharacter: true })).toBe(false);
  });
});
