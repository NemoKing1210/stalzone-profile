import type { MetaRead } from '@dossier/shared/contracts';

import type { DossierPayload } from '~/shared/types/dossier';

/** Shared dossier requests; payload and meta stay in Nuxt's fetch cache across pages. */
export function useDossier() {
  const { data: payload, refresh: refreshPayload } = useFetch<DossierPayload>('/api/v1/payload', {
    key: 'dossier-payload',
  });
  const { data: meta, refresh: refreshMeta } = useFetch<MetaRead>('/api/v1/meta', {
    key: 'dossier-meta',
  });

  async function refresh(): Promise<void> {
    await Promise.all([refreshPayload(), refreshMeta()]);
  }

  return { payload, meta, refresh };
}
