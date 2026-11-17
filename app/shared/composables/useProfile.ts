import type { MetaRead } from '@profile/shared/contracts';

import type { ProfilePayload } from '~/shared/types/profile';

/** Shared profile requests; payload and meta stay in Nuxt's fetch cache across pages. */
export function useProfile() {
  const { data: payload, refresh: refreshPayload } = useFetch<ProfilePayload>('/api/v1/payload', {
    key: 'profile-payload',
  });
  const { data: meta, refresh: refreshMeta } = useFetch<MetaRead>('/api/v1/meta', {
    key: 'profile-meta',
  });

  async function refresh(): Promise<void> {
    await Promise.all([refreshPayload(), refreshMeta()]);
  }

  return { payload, meta, refresh };
}
