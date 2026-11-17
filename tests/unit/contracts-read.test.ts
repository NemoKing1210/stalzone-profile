import { describe, expect, it } from 'vitest';
import {
  CharacterReadSchema,
  ItemCardSchema,
  OwnedReadSchema,
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
  it('accepts an owned row with a null container', () => {
    expect(
      OwnedReadSchema.safeParse({
        id: 1,
        itemId: 2,
        name: 'AK',
        kind: 'weapon',
        level: 15,
        quality: null,
        qty: 1,
        container: null,
      }).success,
    ).toBe(true);
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
