import { storeToRefs } from 'pinia';
import type { WriteDiff, WriteResult } from '@profile/shared/contracts';

import { useWriteStore } from './write';

export type { WriteDiff, WriteResult };

/** The one write path: a Pinia Colada mutation with toast and profile invalidation. */
export function useWrite() {
  const store = useWriteStore();
  const { busy, lastError } = storeToRefs(store);
  return { write: store.write, busy, lastError };
}
