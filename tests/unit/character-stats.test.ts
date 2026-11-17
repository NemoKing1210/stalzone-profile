import { describe, expect, it } from 'vitest';
import { deriveCharacterFields, effectiveCharacterStats } from '@profile/core';

const api = (id: string, value: number | string) => ({
  stat_id: id,
  value_num: typeof value === 'number' ? value : null,
  value_text: typeof value === 'string' ? value : null,
  origin: 'api' as const,
  fetched_at: '2026-01-01T00:00:00.000Z',
});

describe('character stats', () => {
  it('derives K/D, accuracy, headshot, hours and arrived', () => {
    const stats = effectiveCharacterStats([
      api('kil', 250),
      api('dea', 100),
      api('sho-fir', 1000),
      api('sho-hit', 250),
      api('sho-hea', 50),
      api('pla-tim', 'PT123H'),
      api('reg-tim', '2024-06-01'),
      api('ach-gai', 42),
    ]);
    expect(deriveCharacterFields(stats)).toEqual({
      arrived: '2024-06-01',
      hours: 123,
      kd: 2.5,
      accuracy: 25,
      headshot: 20,
      achievements: 42,
      achievementPoints: null,
    });
  });

  it('prefers a manual value and returns null for a missing or zero denominator', () => {
    const stats = effectiveCharacterStats([
      api('kil', 250),
      api('dea', 100),
      { ...api('kil', 300), origin: 'manual', fetched_at: '2026-01-02T00:00:00.000Z' },
    ]);
    expect(deriveCharacterFields(stats).kd).toBe(3);
    expect(deriveCharacterFields(effectiveCharacterStats([api('kil', 250), api('dea', 0)])).kd).toBeNull();
    expect(deriveCharacterFields({})).toMatchObject({
      arrived: null,
      hours: null,
      kd: null,
      accuracy: null,
      headshot: null,
      achievements: null,
    });
  });

  it('parses ISO-8601 durations and leaves unknown text null', () => {
    expect(deriveCharacterFields(effectiveCharacterStats([api('pla-tim', 'PT2H30M')])).hours).toBe(2.5);
    expect(deriveCharacterFields(effectiveCharacterStats([api('pla-tim', '123 ч')])).hours).toBeNull();
  });
});
