import { describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES, bodyTooLarge } from '../../server/utils/body';

describe('request body limit', () => {
  it('bounds only methods that carry a body', () => {
    expect(bodyTooLarge('GET', String(MAX_BODY_BYTES + 1))).toBe(false);
    expect(bodyTooLarge('HEAD', String(MAX_BODY_BYTES + 1))).toBe(false);
    expect(bodyTooLarge('POST', String(MAX_BODY_BYTES + 1))).toBe(true);
    expect(bodyTooLarge('PATCH', String(MAX_BODY_BYTES + 1))).toBe(true);
    expect(bodyTooLarge('DELETE', String(MAX_BODY_BYTES + 1))).toBe(true);
  });

  it('accepts the budget itself and rejects anything above it', () => {
    expect(bodyTooLarge('POST', String(MAX_BODY_BYTES))).toBe(false);
    expect(bodyTooLarge('POST', String(MAX_BODY_BYTES + 1))).toBe(true);
  });

  it('treats a missing or malformed length as unknown, not oversized', () => {
    expect(bodyTooLarge('POST', undefined)).toBe(false);
    expect(bodyTooLarge('POST', '')).toBe(false);
    expect(bodyTooLarge('POST', 'not-a-number')).toBe(false);
  });
});
