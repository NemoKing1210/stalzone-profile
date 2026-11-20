import type { StorageRead } from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';

import { stashTabs } from '~/features/inventory/model/stashTabs';

function storage(id: number, kind: StorageRead['kind'] = 'stash'): StorageRead {
  return {
    id,
    kind,
    name: `${kind}-${id}`,
    width: 8,
    height: kind === 'stash' ? 200 : 20,
    maxWeight: null,
    sortOrder: id,
    items: [],
    weight: { min: 0, max: 0, value: 0, missing: [] },
    updatedAt: null,
  };
}

describe('stash tabs', () => {
  it('has no tabs without a stash or intake', () => {
    expect(stashTabs([], null, null)).toEqual([]);
  });

  it('shows one tab and marks it active', () => {
    const tabs = stashTabs([storage(2)], null, null);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ active: true, storage: { id: 2 } });
  });

  it('keeps intake first and selects the requested stash', () => {
    const tabs = stashTabs([storage(2), storage(3)], storage(9, 'overflow'), 3);
    expect(tabs.map((tab) => tab.storage.id)).toEqual([9, 2, 3]);
    expect(tabs.filter((tab) => tab.active).map((tab) => tab.storage.id)).toEqual([3]);
  });

  it('falls back to the first regular stash for a removed selection', () => {
    const tabs = stashTabs([storage(2), storage(3)], storage(9, 'overflow'), 999);
    expect(tabs.find((tab) => tab.active)?.storage.id).toBe(2);
    const noStashes = stashTabs([], storage(9, 'overflow'), 999);
    expect(noStashes.find((tab) => tab.active)?.storage.id).toBe(9);
  });
});
