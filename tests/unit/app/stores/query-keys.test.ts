import { describe, expect, it } from 'vitest';

import { profileQueryKey, QUERY_KEYS } from '~/stores/keys';

describe('Pinia Colada query keys', () => {
  it('keeps one stable profile key for reads and invalidation', () => {
    expect(profileQueryKey()).toEqual(['profile', 'payload']);
    expect(profileQueryKey()).toBe(QUERY_KEYS.profile);
  });

  it('separates every data surface', () => {
    const keys = Object.values(QUERY_KEYS).map((key) => key.join('/'));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
