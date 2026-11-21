import { describe, expect, it } from 'vitest';

import { chatItemTarget, chatToolView, type ChatItemView } from '~/features/chat/model/render';

const card = (overrides: Partial<ChatItemView> = {}): ChatItemView => ({
  name: 'АК-12',
  rank: 'RANK_MASTER',
  kind: 'weapon',
  category: 'weapon/assault_rifle',
  icon: '/icons/a.png',
  itemId: null,
  instanceId: null,
  level: null,
  qty: null,
  virtual: false,
  location: null,
  weight: null,
  ...overrides,
});

describe('assistant tool rendering', () => {
  it('maps catalog searches to item cards', () => {
    expect(
      chatToolView('find_items', {
        items: [
          {
            id: 2110,
            name: 'АК-12',
            rank: 'RANK_MASTER',
            kind: 'weapon',
            category: 'weapon/assault_rifle',
            icon: '/icons/a.png',
          },
        ],
      }),
    ).toEqual({ kind: 'items', items: [card({ itemId: 2110 })] });
  });

  it('maps a single catalog item from get_item', () => {
    expect(
      chatToolView('get_item', {
        item: {
          id: 2110,
          name: 'АК-12',
          rank: 'RANK_MASTER',
          kind: 'weapon',
          category: 'weapon/assault_rifle',
          icon: '/icons/a.png',
        },
      }),
    ).toEqual({ kind: 'items', items: [card({ itemId: 2110 })] });
  });

  it('maps one owned instance from get_inventory_item', () => {
    const view = chatToolView('get_inventory_item', {
      item: {
        id: 5,
        itemId: 2110,
        name: 'АК-12',
        rank: 'RANK_MASTER',
        kind: 'weapon',
        category: 'weapon/assault_rifle',
        icon: '/icons/a.png',
        level: 10,
        qty: 1,
        placement: { location: 'equipment', slot: 'primary' },
      },
    });
    expect(view).toEqual({
      kind: 'items',
      items: [
        card({
          itemId: 2110,
          instanceId: 5,
          level: 10,
          qty: 1,
          location: 'primary',
        }),
      ],
    });
  });

  it('maps owned instances with their id, level, qty and placement', () => {
    const view = chatToolView('list_inventory_items', {
      items: [
        {
          id: 1,
          itemId: 2110,
          name: 'AA-12',
          kind: 'weapon',
          category: 'weapon/shotgun_rifle',
          rank: 'RANK_MASTER',
          level: 10,
          qty: 1,
          virtual: false,
          icon: '/icons/b.png',
          placement: { location: 'grid', storageId: 2, x: 1, y: 0 },
        },
      ],
    });
    expect(view).toEqual({
      kind: 'items',
      items: [
        card({
          name: 'AA-12',
          rank: 'RANK_MASTER',
          category: 'weapon/shotgun_rifle',
          icon: '/icons/b.png',
          itemId: 2110,
          instanceId: 1,
          level: 10,
          qty: 1,
          location: 'grid',
        }),
      ],
    });
  });

  it('flattens inventory storages, equipment and loose instances', () => {
    const view = chatToolView('get_inventory', {
      storages: [{ name: 'Inventory', items: [{ id: 7, name: 'АК-12', kind: 'weapon', level: 5, qty: 1 }] }],
      equipment: { primary: { id: 8, name: 'АК-12', kind: 'weapon', level: 5, qty: 1 }, secondary: null },
      loose: [{ id: 9, name: 'Виток', kind: 'artifact', level: 0, qty: 1 }],
    });
    expect(view.kind).toBe('items');
    if (view.kind !== 'items') return;
    expect(view.items.map((item) => [item.instanceId, item.location])).toEqual([
      [7, 'Inventory'],
      [8, 'equipment'],
      [9, 'loose'],
    ]);
  });

  it('uses the equipment slot as the location of an equipped instance', () => {
    const view = chatToolView('list_inventory_items', {
      items: [{ id: 2, name: 'АК-12', kind: 'weapon', placement: { location: 'equipment', slot: 'primary' } }],
    });
    expect(view.kind === 'items' && view.items[0]?.location).toBe('primary');
  });

  it('marks a virtual instance', () => {
    const view = chatToolView('list_inventory_items', {
      items: [{ id: 3, name: 'Пузырь', kind: 'artifact', virtual: true }],
    });
    expect(view.kind === 'items' && view.items[0]?.virtual).toBe(true);
  });

  it('attaches a chart to a metric comparison and echoes level and HP', () => {
    const view = chatToolView('find_items', {
      level: 15,
      hp: 600,
      items: [
        { name: 'АК-12', kind: 'weapon', metrics: { ttk: 0.6, dps: 200 } },
        { name: 'АК-15', kind: 'weapon', metrics: { ttk: 0.5, dps: 210 } },
      ],
    });
    expect(view.kind).toBe('items');
    if (view.kind !== 'items') return;
    expect(view.chart).toMatchObject({ defaultMetric: 'ttk', level: 15, hp: 600 });
    expect(view.chart?.metrics.map((metric) => metric.key)).toEqual(['ttk', 'dps']);
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

  it('falls back to a readable JSON block for an unknown tool', () => {
    expect(chatToolView('sources_status', { ok: true })).toEqual({
      kind: 'json',
      json: '{\n  "ok": true\n}',
    });
  });
});

describe('chat card targets', () => {
  it('opens an owned instance in the global modal', () => {
    expect(chatItemTarget(card({ instanceId: 42 }))).toEqual({
      mode: 'instance',
      instanceId: 42,
      kind: 'weapon',
    });
  });

  it('opens a catalog row with the fields its header reads', () => {
    expect(chatItemTarget(card({ kind: 'modification', name: 'АКМЛ' }))).toEqual({
      mode: 'catalog',
      kind: 'modification',
      name: 'АКМЛ',
      icon: '/icons/a.png',
      rank: 'RANK_MASTER',
      category: 'weapon/assault_rifle',
    });
  });

  it('has no target for a stackable or unknown kind', () => {
    expect(chatItemTarget(card({ kind: 'ammo' }))).toBeNull();
    expect(chatItemTarget(card({ kind: null }))).toBeNull();
  });
});
