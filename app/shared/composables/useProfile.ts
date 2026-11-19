import type { MetaRead } from '@profile/shared/contracts';

import type { ProfilePayload } from '~/shared/types/profile';

/**
 * One payload request per page: `/api/v1/meta` duplicates data the payload already
 * carries, so the meta view is derived locally and only the payload is refreshed.
 */
export function useProfile() {
  const { data: payload, refresh: refreshPayload } = useFetch<ProfilePayload>('/api/v1/payload', {
    key: 'profile-payload',
  });
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
    await refreshPayload();
  }

  return { payload, meta, refresh };
}
