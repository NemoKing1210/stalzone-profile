import { describe, expect, it } from 'vitest';

import {
  itemCreatePayload,
  itemFormFields,
  itemPatchPayload,
  skinsFor,
} from '~/features/inventory/model/itemForm';

describe('per-kind item form matrix', () => {
  it('shows level and skin only for weapons and armor', () => {
    expect(itemFormFields('weapon')).toEqual({ level: true, qty: false, rarity: false, skin: true });
    expect(itemFormFields('armor')).toEqual({ level: true, qty: false, rarity: false, skin: true });
  });

  it('shows the rarity roll only for artifacts and quantity only for stacks', () => {
    expect(itemFormFields('artifact')).toEqual({ level: false, qty: false, rarity: true, skin: false });
    expect(itemFormFields('ammo')).toEqual({ level: false, qty: true, rarity: false, skin: false });
    expect(itemFormFields('other')).toEqual({ level: false, qty: true, rarity: false, skin: false });
  });

  it('hides every text field for containers and attachments', () => {
    expect(itemFormFields('container')).toEqual({ level: false, qty: false, rarity: false, skin: false });
    expect(itemFormFields('attachment')).toEqual({ level: false, qty: false, rarity: false, skin: false });
  });
});

describe('skin options', () => {
  const motifs = [
    { name: 'Свой', baseItemId: 7 },
    { name: 'Чужой', baseItemId: 8 },
    { name: 'Без основы', baseItemId: null },
  ];

  it('offers only motifs whose base is the chosen item', () => {
    expect(skinsFor(motifs, 7)).toEqual(['Свой']);
    expect(skinsFor(motifs, null)).toEqual([]);
    expect(skinsFor([{ name: 'Без основы', baseItemId: null }], 7)).toEqual([]);
  });
});

describe('form to payload', () => {
  it('sends only the visible create fields and drops the slot', () => {
    const body = itemCreatePayload(
      'weapon',
      { name: 'АК-12', slot: 'основное' },
      { level: 15, qty: 9, rarityPct: 140, skin: 'Свой', virtual: false },
    );
    expect(body).toEqual({ name: 'АК-12', kind: 'weapon', dryRun: false, virtual: false, level: 15, skin: 'Свой' });
    expect(body).not.toHaveProperty('slot');
    expect(body).not.toHaveProperty('note');
    expect(body).not.toHaveProperty('role');
  });

  it('clamps level and quantity to the schema range', () => {
    expect(
      itemCreatePayload('weapon', { name: 'АК-12' }, { level: 99, qty: 1, rarityPct: null, skin: null, virtual: false })
        .level,
    ).toBe(15);
    expect(
      itemCreatePayload('ammo', { name: '5.45' }, { level: 0, qty: 999, rarityPct: null, skin: null, virtual: false })
        .qty,
    ).toBe(99);
  });

  it('sends the exact catalog id and no fields an attachment cannot take', () => {
    const body = itemCreatePayload(
      'attachment',
      { id: 42, name: 'Прицел' },
      { level: 9, qty: 4, rarityPct: 99, skin: 'Свой', virtual: true },
    );
    expect(body).toEqual({
      name: 'Прицел',
      kind: 'attachment',
      catalogItemId: 42,
      dryRun: false,
      virtual: true,
    });
    expect(
      itemCreatePayload(
        'ammo',
        { id: 7, name: '5.45' },
        { level: 0, qty: 3, rarityPct: null, skin: null, virtual: false },
      ),
    ).toEqual({ name: '5.45', kind: 'ammo', catalogItemId: 7, dryRun: false, virtual: false, qty: 3 });
  });

  it('builds one artifact rarity field and no quality', () => {
    const body = itemCreatePayload(
      'artifact',
      { name: 'Нервяк' },
      { level: 0, qty: 1, rarityPct: 141, skin: null, virtual: false },
    );
    expect(body).toEqual({ name: 'Нервяк', kind: 'artifact', dryRun: false, virtual: false, rarityPct: 141 });
    expect(body).not.toHaveProperty('quality');
  });

  it('patches only allowed fields that changed, and returns null otherwise', () => {
    const target = { level: 3, qty: 1, rarityPct: null, skinName: null };
    expect(
      itemPatchPayload('weapon', target, { level: 3, qty: 1, rarityPct: 141, skin: null, virtual: false }),
    ).toBeNull();
    expect(
      itemPatchPayload('weapon', target, { level: 9, qty: 1, rarityPct: null, skin: 'Свой', virtual: false }),
    ).toEqual({ level: 9, skin: 'Свой', dryRun: false });
    expect(
      itemPatchPayload(
        'artifact',
        { ...target, rarityPct: 100 },
        { level: 0, qty: 1, rarityPct: 160, skin: null, virtual: false },
      ),
    ).toEqual({ rarityPct: 160, dryRun: false });
  });
});
