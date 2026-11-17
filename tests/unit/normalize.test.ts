import { describe, expect, it } from 'vitest';
import { remoteIcon, wikiEffects, wikiStats } from '@dossier/core/services/normalize';

describe('normalize', () => {
  it('keeps a wiki range as min/max and a variant as per-level numbers', () => {
    const stats = wikiStats(
      {
        stats: [
          {
            key: 'stalker.artefact_properties.factor.speed_modifier',
            name: { lines: { ru: 'Скорость' } },
            value: { min: 0.5, max: 1 },
            is_percentage: true,
          },
          { key: 'damage.start', numericVariants: [10, 11, 12] },
        ],
        additionalStats: [],
      },
      {},
    );
    expect(stats).toContainEqual({
      key: 'speed_modifier',
      label: 'Скорость',
      valueNum: null,
      valueMin: 0.5,
      valueMax: 1,
      pct: true,
      positive: null,
      isAdditional: false,
    });
    expect(stats.filter((s) => s.key === 'damage.start').map((s) => s.level)).toEqual([0, 1, 2]);
  });

  it('turns positive wiki stats into display effect lines', () => {
    expect(
      wikiEffects({
        stats: [
          { name: { lines: { ru: 'Скорость' } }, is_positive: true },
          { name: { lines: { ru: 'Радиация' } }, is_positive: false },
        ],
      }),
    ).toEqual([
      { position: 0, label: 'Скорость', isPositive: true },
      { position: 1, label: 'Радиация', isPositive: false },
    ]);
  });
});

describe('remoteIcon', () => {
  it('derives the EXBO icon URL from a record and a realm', () => {
    const rec = { id: 'WG53', cat: 'weapon/assault_rifle' };
    expect(remoteIcon(rec)).toBe(
      'https://raw.githubusercontent.com/EXBO-Studio/stalzone-database/main/ru/icons/weapon/assault_rifle/wg53.png',
    );
    expect(remoteIcon(rec, 'eu')).toContain('/eu/icons/');
  });

  it('returns null when the record has no id or category', () => {
    expect(remoteIcon({ id: 'WG53' })).toBeNull();
    expect(remoteIcon({})).toBeNull();
  });
});
