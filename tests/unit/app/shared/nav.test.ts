import { describe, expect, it } from 'vitest';

import { navCounts } from '~/shared/lib/nav';
import type { ProfilePayload } from '~/shared/types/profile';

function payload(
  counts: { weapons: number; armor: number; containers: number; artifacts: number },
  inventory: { storage?: number[]; equipment?: number[]; loose?: number[] } = {},
  devices = 0,
): ProfilePayload {
  const item = (id: number) => ({ id });
  return {
    weapons: Array.from({ length: counts.weapons }, () => ({})),
    armor: Array.from({ length: counts.armor }, () => ({})),
    containers: Array.from({ length: counts.containers }, () => ({})),
    artifacts: Array.from({ length: counts.artifacts }, () => ({})),
    catalog: {
      weapons: [],
      armor: [],
      devices: Array.from({ length: devices }, (_, index) => ({
        name: `device ${index}`,
        rank: 'default',
        type: null,
        category: 'device/device',
        icon: null,
        weight: null,
      })),
      meta: { updated: null, source: '', items: 0 },
    },
    inventory: {
      storages: [
        { id: 1, items: (inventory.storage ?? []).map(item) },
        { id: 2, items: [] },
      ],
      equipment: {
        primary: (inventory.equipment ?? [])[0] ? item((inventory.equipment ?? [])[0]!) : null,
        secondary: null,
        melee: null,
        armor: null,
        backpack: null,
        container: null,
        quick1: null,
        quick2: null,
        quick3: null,
        quick4: null,
      },
      loose: (inventory.loose ?? []).map(item),
    },
  } as unknown as ProfilePayload;
}

describe('navigation count badges', () => {
  it('shows nothing while the payload is missing', () => {
    expect(navCounts(undefined)).toEqual({
      weapons: null,
      armor: null,
      containers: null,
      artifacts: null,
      modifications: null,
      inventory: null,
      devices: null,
    });
  });

  it('shows zero as a real count', () => {
    expect(navCounts(payload({ weapons: 0, armor: 0, containers: 0, artifacts: 0 }))).toEqual({
      weapons: 0,
      armor: 0,
      containers: 0,
      artifacts: 0,
      modifications: 0,
      inventory: 0,
      devices: 0,
    });
  });

  it('mirrors the owned-list lengths for one and many', () => {
    expect(navCounts(payload({ weapons: 1, armor: 2, containers: 3, artifacts: 4 }))).toEqual({
      weapons: 1,
      armor: 2,
      containers: 3,
      artifacts: 4,
      modifications: 0,
      inventory: 0,
      devices: 0,
    });
    expect(navCounts(payload({ weapons: 0, armor: 0, containers: 0, artifacts: 0 }, {}, 17)).devices).toBe(17);
  });

  it('counts installed modifications inside a weapon once', () => {
    const base = payload({ weapons: 0, armor: 0, containers: 0, artifacts: 0 }, { storage: [10] });
    const weapon = base.inventory.storages[0]!.items[0] as unknown as {
      kind: string;
      modifications?: { id: number; kind: string }[];
    };
    weapon.kind = 'weapon';
    weapon.modifications = [
      { id: 41, kind: 'modification' },
      { id: 42, kind: 'modification' },
    ];
    expect(navCounts(base).modifications).toBe(2);
  });

  it('counts every inventory instance once across grids, equipment and loose', () => {
    const counts = navCounts(
      payload({ weapons: 0, armor: 0, containers: 0, artifacts: 0 }, {
        storage: [10, 11],
        equipment: [12],
        loose: [10, 13],
      }),
    );

    expect(counts.inventory).toBe(4);
  });

  it('counts a stack as one item and keeps an empty inventory at zero', () => {
    expect(
      navCounts(payload({ weapons: 0, armor: 0, containers: 0, artifacts: 0 }, { storage: [21, 22, 23] })).inventory,
    ).toBe(3);
    expect(navCounts(payload({ weapons: 0, armor: 0, containers: 0, artifacts: 0 })).inventory).toBe(0);
  });
});
