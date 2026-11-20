import { describe, expect, it } from 'vitest';

import { chatToolView } from '~/features/chat/model/render';

describe('assistant tool rendering', () => {
  it('maps item searches to name/rank rows', () => {
    const view = chatToolView('find_items', {
      items: [{ name: 'АК-12', rank: 'master', kind: 'weapon', category: 'weapon/assault_rifle', icon: '/icons/a.png' }],
    });
    expect(view).toEqual({
      kind: 'items',
      items: [{ name: 'АК-12', rank: 'master', kind: 'weapon', category: 'weapon/assault_rifle', icon: '/icons/a.png' }],
    });
  });

  it('maps prices and keeps a missing lot null', () => {
    expect(chatToolView('get_prices', { prices: [{ name: 'АК-12', price: 12500, lots: 3, quality: 'Rare' }] })).toMatchObject({
      kind: 'prices',
      prices: [{ name: 'АК-12', price: 12500, lots: 3, quality: 'Rare' }],
    });
    expect(chatToolView('get_prices', { prices: [{ name: 'АК-12' }] })).toMatchObject({
      kind: 'prices',
      prices: [{ price: null, lots: null }],
    });
  });

  it('flattens inventory storages, equipment and loose rows', () => {
    const view = chatToolView('get_inventory', {
      storages: [{ name: 'Inventory', items: [{ name: 'АК-12', level: 5, qty: 1 }] }],
      equipment: { primary: { name: 'АК-12', level: 5, qty: 1 }, secondary: null },
      loose: [{ name: 'Виток', level: 0, qty: 1 }],
    });
    expect(view.kind).toBe('inventory');
    if (view.kind !== 'inventory') return;
    expect(view.rows).toEqual([
      { name: 'АК-12', level: 5, qty: 1, location: 'Inventory' },
      { name: 'АК-12', level: 5, qty: 1, location: 'equipment' },
      { name: 'Виток', level: 0, qty: 1, location: 'loose' },
    ]);
  });

  it('falls back to a readable JSON block for an unknown tool', () => {
    expect(chatToolView('sources_status', { ok: true })).toEqual({
      kind: 'json',
      json: '{\n  "ok": true\n}',
    });
  });
});
