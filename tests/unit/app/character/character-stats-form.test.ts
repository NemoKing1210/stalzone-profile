import { describe, expect, it } from 'vitest';
import { toCharacterStatsPatch } from '../../../../app/features/character/model/characterStatsForm';

describe('character stats form', () => {
  it('maps raw counters to the stats patch and empty inputs to null', () => {
    expect(
      toCharacterStatsPatch({
        kil: 300,
        dea: 100,
        'sho-fir': 1000,
        'sho-hit': 250,
        'sho-hea': 50,
        'pla-tim': 123,
        'ach-gai': 42,
        'reg-tim': '2024-06-01',
      }),
    ).toEqual({
      kil: 300,
      dea: 100,
      'sho-fir': 1000,
      'sho-hit': 250,
      'sho-hea': 50,
      'pla-tim': 123,
      'ach-gai': 42,
      'reg-tim': '2024-06-01',
    });
    expect(
      toCharacterStatsPatch({
        kil: 300,
        dea: null,
        'sho-fir': null,
        'sho-hit': null,
        'sho-hea': null,
        'pla-tim': null,
        'ach-gai': null,
        'reg-tim': '',
      }),
    ).toEqual({
      kil: 300,
      dea: null,
      'sho-fir': null,
      'sho-hit': null,
      'sho-hea': null,
      'pla-tim': null,
      'ach-gai': null,
      'reg-tim': null,
    });
  });

  it('coerces numeric counters typed as strings', () => {
    expect(toCharacterStatsPatch({ kil: '300', 'reg-tim': '2024-06-01', 'pla-tim': 'PT123H' })).toMatchObject({
      kil: 300,
      'reg-tim': '2024-06-01',
      'pla-tim': 'PT123H',
    });
  });
});
