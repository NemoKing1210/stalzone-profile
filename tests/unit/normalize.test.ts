import { describe, expect, it } from 'vitest';
import { remoteIcon, wikiEffects, wikiStats } from '@profile/core';

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

  it('maps wiki container fields onto the keys the cards read', () => {
    const stats = wikiStats({ stats: [], additionalStats: [], capacity: 4, effectiveness: 80, protection: 62.5 }, {});

    expect(stats).toHaveLength(3);
    expect(stats).toContainEqual(expect.objectContaining({ key: 'container.slots', valueNum: 4 }));
    expect(stats).toContainEqual(expect.objectContaining({ key: 'container.effectiveness', valueNum: 80 }));
    expect(stats).toContainEqual(expect.objectContaining({ key: 'container.protection', valueNum: 62.5 }));
  });

  it('keeps a real zero and omits an absent or non-numeric container field', () => {
    const zero = wikiStats({ stats: [], additionalStats: [], capacity: 0 }, {});
    expect(zero).toContainEqual(expect.objectContaining({ key: 'container.slots', valueNum: 0 }));
    expect(zero.some((stat) => stat.key === 'container.effectiveness')).toBe(false);

    const text = wikiStats({ stats: [], additionalStats: [], capacity: 'many' }, {});
    expect(text.some((stat) => stat.key === 'container.slots')).toBe(false);
  });

  it('ignores stat entries that carry no value', () => {
    const stats = wikiStats(
      { stats: [{ key: 'some.key', value: {} }], additionalStats: [{ key: 'other.key' }] },
      {},
    );

    expect(stats).toEqual([]);
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
