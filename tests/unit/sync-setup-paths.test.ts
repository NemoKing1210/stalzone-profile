import { describe, expect, it } from 'vitest';
import { ensureDefaultSources, runSync, SYNC_SOURCES } from '@profile/core/modules/sync';
import { setupState } from '@profile/core/modules/setup';

describe('sync and setup public APIs', () => {
  it('exposes sync sources, bootstrap and setup state', () => {
    expect(SYNC_SOURCES).toContain('icons');
    expect(typeof runSync).toBe('function');
    expect(typeof ensureDefaultSources).toBe('function');
    expect(typeof setupState).toBe('function');
  });
});
