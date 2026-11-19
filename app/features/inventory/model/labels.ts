import type { StorageKind } from '@profile/shared/contracts';

/** The visible name of a storage: built-in rows are translated, custom stash names are kept. */
export function storageLabel(storage: { kind: StorageKind; name: string }, t: (key: string) => string): string {
  if (storage.kind === 'inventory') return t('inventory.title');
  if (storage.kind === 'overflow') return t('inventory.overflow');
  if (storage.kind === 'stash' && storage.name.trim().toLowerCase() === 'stash') return t('inventory.stash');
  return storage.name;
}
