import { describe, expect, it } from 'vitest';
import {
  metricByKey,
  metricRow,
  type ItemRow,
  type ItemStatRow,
  type MetricContext,
} from '@profile/core/modules/catalog';

function stat(statId: string, level: number, valueNum: number): ItemStatRow {
  return {
    item_id: 1,
    stat_id: statId,
    label: null,
    level,
    value_num: valueNum,
    value_min: null,
    value_max: null,
    value_text: null,
    pct: 0,
    is_positive: null,
    is_additional: 0,
    source_id: null,
  };
}

function item(kind: string, weight: number | null): ItemRow {
  return {
    id: 1,
    source_id: 'local',
    realm: 'ru',
    external_id: 'x',
    name: 'Тест',
    name_norm: 'тест',
    name_en: null,
    name_en_norm: '',
    name_key: null,
    kind,
    category: null,
    rank: null,
    slot: null,
    weight,
    is_cosmetic: 0,
    base_item_id: null,
    created_at: '',
    updated_at: '',
  };
}

function context(kind: string, rows: ItemStatRow[], level = 15): MetricContext {
  return { item: item(kind, 3.8), rows, level, hp: 600 };
}

describe('weapon metrics', () => {
  it('derives damage, DPS and TTK from the shared formula', () => {
    const metrics = metricRow(
      context('weapon', [
        stat('damage.start', 15, 55),
        stat('weapon.tooltip.weapon.info.rate_of_fire', 15, 600),
        stat('weapon.tooltip.weapon.info.recoil', 15, 42),
      ]),
    );
    expect(metrics.damage).toBe(55);
    expect(metrics.dps).toBe(550);
    expect(metrics.ttk).toBe(1);
    expect(metrics.recoil).toBe(42);
  });

  it('keeps a missing stat null and marks lower-is-better metrics', () => {
    const metrics = metricRow(context('weapon', []));
    expect(metrics.recoil).toBeNull();
    expect(metricByKey('recoil')?.direction).toBe('lower');
    expect(metricByKey('dps')?.direction).toBe('higher');
  });
});

describe('armor and container metrics', () => {
  it('reads the armor curve at the requested level', () => {
    const rows = [stat('bullet_dmg_factor', 0, 40), stat('bullet_dmg_factor', 15, 70)];
    expect(metricRow(context('armor', rows, 15)).armor).toBe(70);
    expect(metricRow(context('armor', rows, 0)).armor).toBe(40);
  });

  it('reads container slots and effectiveness as numbers', () => {
    const metrics = metricRow(
      context(
        'container',
        [stat('container.slots', 0, 4), stat('container.effectiveness', 0, 80)],
        0,
      ),
    );
    expect(metrics).toMatchObject({ slots: 4, effectiveness: 80, slotEquivalent: 3.2 });
  });
});
