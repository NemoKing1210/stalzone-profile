import { describe, expect, it } from 'vitest';

import { chatAnswer } from '~/features/chat/model/answer';
import type { ChatToolRunView } from '~/features/chat/model/rows';

function run(name: string, payload: unknown, status: ChatToolRunView['status'] = 'ok'): ChatToolRunView {
  return { id: `${name}-1`, name, status, payload };
}

const weapon = (name: string) => ({ name, kind: 'weapon', category: 'weapon/assault_rifle', rank: 'RANK_MASTER' });

describe('chat answer', () => {
  it('deduplicates items across tool runs and prefers the compare_items chart', () => {
    const answer = chatAnswer([
      run('find_items', {
        level: 15,
        hp: 600,
        items: [
          { ...weapon('АК-12'), metrics: { ttk: 0.6, dps: 200 } },
          { ...weapon('АК-15'), metrics: { ttk: 0.5, dps: 210 } },
          { ...weapon('АК-308'), metrics: { ttk: 0.8, dps: 190 } },
        ],
      }),
      run('compare_items', {
        level: 15,
        hp: 600,
        items: [
          { name: 'АК-12', kind: 'weapon', rank: 'RANK_MASTER', metrics: { ttk: 0.6, dps: 200 } },
          { name: 'АК-15', kind: 'weapon', rank: 'RANK_MASTER', metrics: { ttk: 0.5, dps: 210 } },
        ],
      }),
    ]);
    expect(answer.items.map((item) => item.name)).toEqual(['АК-12', 'АК-15']);
    // The compare row omits category; the search row for the same item fills it in.
    expect(answer.items[0]?.category).toBe('weapon/assault_rifle');
    expect(answer.chart?.series.map((series) => series.item.name)).toEqual(['АК-12', 'АК-15']);
  });

  it('keeps prices and a plain text answer from successful runs', () => {
    const answer = chatAnswer([
      run('get_prices', { prices: [{ name: 'АК-12', price: 12500, lots: 3 }] }),
      run('get_character', { character: { nick: 'Nemo', faction: 'Рубеж', region: 'ru' } }),
    ]);
    expect(answer.prices).toMatchObject([{ name: 'АК-12', price: 12500, lots: 3 }]);
    expect(answer.text).toEqual(['Nemo — Рубеж — ru']);
  });

  it('ignores a declined run', () => {
    const answer = chatAnswer([run('find_items', { items: [weapon('АК-12')] }, 'declined')]);
    expect(answer.items).toEqual([]);
    expect(answer.chart).toBeNull();
  });
});
