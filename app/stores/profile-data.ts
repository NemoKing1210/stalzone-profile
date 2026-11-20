import { storeToRefs } from 'pinia';

import { useProfileStore } from './profile';

/**
 * Ref-shaped view of the profile store for components and composables. The store owns
 * the query; this keeps `payload.value` and `meta.value` stable in scripts and templates.
 */
export function useProfileData() {
  const store = useProfileStore();
  const { payload, meta } = storeToRefs(store);
  return { payload, meta, refresh: store.refresh, invalidate: store.invalidate };
}
