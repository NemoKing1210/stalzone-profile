import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from '../../app/shared/lib/apiErrorMessage';

// Codes from design D6: each one must resolve to its localized message.
const KNOWN_CODES = [
  'UNAUTHORIZED',
  'INVALID_PASSWORD',
  'VALIDATION',
  'ORIGIN_REQUIRED',
  'ORIGIN_MISMATCH',
  'TOO_MANY_ATTEMPTS',
  'UNKNOWN_ITEM',
  'OWNED_NOT_FOUND',
  'OWNED_CONFLICT',
  'NOT_A_CONTAINER',
  'DETAIL_NOT_FOUND',
  'ITEM_NOT_FOUND',
  'EVENT_NOT_FOUND',
  'NOT_ROLLBACKABLE',
  'NOTHING_TO_CLEAR',
  'DB_UNAVAILABLE',
  'NO_CHARACTER',
  'PIN_LIMIT',
  'PIN_TARGET_INVALID',
  'CHAT_REF_NOT_FOUND',
  'CHAT_REF_UNSUPPORTED',
];

function fakeTranslate(available: string[]): (key: string) => string {
  const keys = new Set(available);
  return (key) => (keys.has(key) ? `t:${key}` : key);
}

describe('apiErrorMessage', () => {
  it('maps every known code to its errors.<code> key', () => {
    const t = fakeTranslate(KNOWN_CODES.map((code) => `errors.${code}`));
    for (const code of KNOWN_CODES) {
      expect(apiErrorMessage(code, 'server message', t)).toBe(`t:errors.${code}`);
    }
  });

  it('returns the server message for an unknown code', () => {
    const t = fakeTranslate(['errors.generic']);
    expect(apiErrorMessage('SOMETHING_NEW', 'server message', t)).toBe('server message');
  });

  it('returns the generic error when both code and message are missing', () => {
    const t = fakeTranslate(['errors.generic']);
    expect(apiErrorMessage(undefined, undefined, t)).toBe('t:errors.generic');
    expect(apiErrorMessage('SOMETHING_NEW', '', t)).toBe('t:errors.generic');
  });

  it('falls back to the server message when the catalog has no key', () => {
    const t = fakeTranslate(['errors.generic']);
    expect(apiErrorMessage('VALIDATION', 'server message', t)).toBe('server message');
  });
});
