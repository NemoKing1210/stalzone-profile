import { useQuery, useQueryCache } from '@pinia/colada';
import { defineStore } from 'pinia';
import type { MetaRead } from '@profile/shared/contracts';

import type { ProfilePayload } from '~/shared/types/profile';
import { QUERY_KEYS } from './keys';

/**
 * The single profile read. `useQuery` deduplicates every consumer, keeps the payload
 * across route changes and lets a write invalidate exactly one key.
 */
export const useProfileStore = defineStore('profile', () => {
  const cache = useQueryCache();
  // On the server this forwards the session cookie to the internal API; on the client
  // it is the same fetch.
  const request = useRequestFetch();
  const query = useQuery({
    key: QUERY_KEYS.profile,
    query: () => request<ProfilePayload>('/api/v1/payload'),
    staleTime: 15_000,
  });

  const payload = computed<ProfilePayload | null>(() => query.data.value ?? null);
  const meta = computed<MetaRead | undefined>(() => {
    const value = payload.value;
    if (!value) return undefined;
    return {
      meta: value.meta as MetaRead['meta'],
      catalogMeta: value.catalog.meta as MetaRead['catalogMeta'],
      freshness: value.freshness as MetaRead['freshness'],
    };
  });

  async function refresh(): Promise<void> {
    await query.refresh();
  }

  async function invalidate(): Promise<void> {
    await cache.invalidateQueries({ key: QUERY_KEYS.profile, exact: true });
  }

  return {
    payload,
    meta,
    pending: query.isPending,
    error: query.error,
    refresh,
    invalidate,
  };
});
