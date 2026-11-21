import { describe, expect, it } from 'vitest';
import {
  CharacterReadSchema,
  InventoryReadSchema,
  ItemCardSchema,
  WriteResultSchema,
} from '@profile/shared/contracts';

describe('read contracts', () => {
  it('keeps missing values as null', () => {
    const card = { kind: 'weapon', name: 'AK', icon: null, type: null, rank: null, slot: null, weight: null };
    expect(ItemCardSchema.parse(card).icon).toBeNull();
  });
  it('accepts a write result with and without an event id', () => {
    const base = { dryRun: true, diff: { before: null, after: null, human: 'x' } };
    expect(WriteResultSchema.safeParse(base).success).toBe(true);
    expect(WriteResultSchema.safeParse({ ...base, eventId: 3 }).success).toBe(true);
  });
  it('parses a full inventory read with nested container contents', () => {
    const range = (value: number) => ({ min: value, max: value, value, missing: [] });
    const base = {
      displayName: null,
      quality: null,
      rarityPct: null,
      rarityTier: null,
      virtual: false,
      skinItemId: null,
      icon: null,
      note: null,
      role: null,
      slot: null,
    };
    const artifact = {
      ...base,
      id: 3,
      itemId: 30,
      name: 'Нервяк',
      kind: 'artifact',
      category: 'artefact',
      rank: 'rare',
      level: 15,
      qty: 1,
      weight: 0.1,
      size: { width: 1, height: 1 },
      placement: { location: 'container', containerItemId: 2, slotIndex: 0 },
      container: null,
    };
    const backpack = {
      ...base,
      id: 2,
      itemId: 20,
      name: 'Рюкзак',
      kind: 'container',
      category: 'containers',
      rank: 'rare',
      level: 15,
      qty: 1,
      weight: 1.2,
      size: { width: 3, height: 3 },
      placement: { location: 'equipment', slot: 'container' },
      container: { type: 'Backpack', shield: null, bonus: null, protection: 50, slots: 2, eff: 100 },
      artifacts: [artifact],
    };
    const rifle = {
      ...base,
      id: 1,
      itemId: 10,
      name: 'АК-12',
      kind: 'weapon',
      category: 'weapon/assault_rifle',
      rank: 'rare',
      level: 15,
      qty: 1,
      weight: 3.8,
      size: { width: 5, height: 2 },
      placement: { location: 'equipment', slot: 'primary' },
      container: null,
    };
    const parsed = InventoryReadSchema.parse({
      storages: [
        {
          id: 1,
          kind: 'inventory',
          name: 'Inventory',
          width: 8,
          height: 8,
          maxWeight: null,
          sortOrder: 0,
          items: [],
          weight: range(0),
          updatedAt: null,
        },
      ],
      equipment: {
        primary: rifle,
        secondary: null,
        melee: null,
        armor: null,
        backpack: null,
        container: backpack,
        quick1: null,
        quick2: null,
        quick3: null,
        quick4: null,
      },
      loose: [],
      stats: {
        carry: {
          base: 50,
          bonus: range(0),
          total: range(50),
          safeLimit: range(37.5),
          carried: range(0),
          aboveSafe: false,
          overweight: false,
        },
        storages: {},
        protection: {},
        effects: {},
        containers: [],
        warnings: [],
      },
      updatedAt: null,
    });
    expect(parsed.storages[0]?.kind).toBe('inventory');
    expect(parsed.equipment.primary?.placement).toMatchObject({ location: 'equipment', slot: 'primary' });
    expect(parsed.equipment.container?.artifacts?.[0]?.name).toBe('Нервяк');
  });

  it('accepts a character with derived fields set to null', () => {
    expect(
      CharacterReadSchema.safeParse({
        id: 1,
        nick: 'T',
        region: 'ru',
        kd: null,
        accuracy: null,
        headshot: null,
        hours: null,
        achievements: null,
        achievementPoints: null,
        arrived: null,
        stats: {},
      }).success,
    ).toBe(true);
  });
});
