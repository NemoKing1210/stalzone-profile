import { describe, expect, it } from 'vitest';
import { openDb } from '@profile/core/platform/db';
import { loadConfig } from '@profile/core/platform/config';
import { createSessionToken } from '@profile/core/platform/security';

describe('platform public paths', () => {
  it('exposes lifecycle, config and security functions', () => {
    expect(typeof openDb).toBe('function');
    expect(typeof loadConfig).toBe('function');
    expect(typeof createSessionToken).toBe('function');
  });
});
