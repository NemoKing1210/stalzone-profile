import { describe, expect, it } from 'vitest';

import {
  categoryLabel,
  highlightSegments,
  isOwnableCatalogItem,
  nextSelectionIndex,
  ownedInstanceCounts,
} from '~/features/inventory/model/itemPicker';

describe('category labels', () => {
  it('translates the known game category paths', () => {
    expect(categoryLabel('weapon/assault_rifle')).toBe('Автоматы');
    expect(categoryLabel('artefact/gravity')).toBe('гравитационный');
  });

  it('falls back to the readable tail of an unknown path', () => {
    expect(categoryLabel('device/night_vision')).toBe('night vision');
    expect(categoryLabel('other')).toBe('other');
  });

  it('has no label without a category', () => {
    expect(categoryLabel(null)).toBeNull();
    expect(categoryLabel('')).toBeNull();
  });
});

describe('search highlighting', () => {
  it('marks every word regardless of order and case', () => {
    expect(highlightSegments('АК-12 Автомат', '12 ак')).toEqual([
      { text: 'АК', match: true },
      { text: '-', match: false },
      { text: '12', match: true },
      { text: ' Автомат', match: false },
    ]);
  });

  it('treats ё and е as the same letter', () => {
    expect(highlightSegments('Тёплый', 'тепл')).toEqual([
      { text: 'Тёпл', match: true },
      { text: 'ый', match: false },
    ]);
  });

  it('returns the plain text when the query is empty', () => {
    expect(highlightSegments('АК-12', '   ')).toEqual([{ text: 'АК-12', match: false }]);
  });
});

describe('ownable catalog rows', () => {
  it('keeps gear and stacks but drops motifs, cosmetic variants and styles', () => {
    expect(isOwnableCatalogItem({ kind: 'weapon', category: 'weapon/assault_rifle', cosmetic: false })).toBe(true);
    expect(isOwnableCatalogItem({ kind: 'ammo', category: 'bullet', cosmetic: false })).toBe(true);
    expect(isOwnableCatalogItem({ kind: 'motif', category: 'other', cosmetic: false })).toBe(false);
    expect(isOwnableCatalogItem({ kind: 'weapon', category: 'weapon/assault_rifle', cosmetic: true })).toBe(false);
    expect(isOwnableCatalogItem({ kind: 'weapon', category: 'styles', cosmetic: false })).toBe(false);
  });
});

describe('owned instance counts', () => {
  it('counts instances, not their quantity', () => {
    const counts = ownedInstanceCounts([
      { name: 'АК-12' },
      { name: 'АК-12' },
      { name: 'Нервяк' },
    ]);
    expect(counts.get('АК-12')).toBe(2);
    expect(counts.get('Нервяк')).toBe(1);
    expect(counts.get('Чужой')).toBeUndefined();
  });

  it('returns an empty map when nothing is owned', () => {
    expect(ownedInstanceCounts([]).size).toBe(0);
  });
});

describe('keyboard selection', () => {
  it('wraps at both ends', () => {
    expect(nextSelectionIndex(-1, 1, 3)).toBe(0);
    expect(nextSelectionIndex(-1, -1, 3)).toBe(2);
    expect(nextSelectionIndex(2, 1, 3)).toBe(0);
    expect(nextSelectionIndex(0, -1, 3)).toBe(2);
  });

  it('has no selection for an empty list', () => {
    expect(nextSelectionIndex(0, 1, 0)).toBe(-1);
  });
});
