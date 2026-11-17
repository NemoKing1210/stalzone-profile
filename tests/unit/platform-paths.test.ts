import { describe, expect, it } from 'vitest';
import { openDb } from '@dossier/core/platform/db';
import { loadConfig } from '@dossier/core/platform/config';
import { createSessionToken } from '@dossier/core/platform/security';

describe('platform public paths', () => {
  it('exposes lifecycle, config and security functions', () => {
    expect(typeof openDb).toBe('function');
    expect(typeof loadConfig).toBe('function');
    expect(typeof createSessionToken).toBe('function');
  });
});
