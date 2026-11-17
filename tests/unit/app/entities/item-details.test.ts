import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findDetailsCard } from '~/entities/item/model/details';

describe('item details lookup', () => {
  const details = { 'w:AK-12': { name: 'AK-12' } };

  it('finds a card by its exact prefix and name', () => {
    expect(findDetailsCard(details, 'w', 'AK-12')).toEqual({ name: 'AK-12' });
  });

  it('falls back to a normalized name', () => {
    expect(findDetailsCard(details, 'w', 'ak-12')).toEqual({ name: 'AK-12' });
  });

  it('returns null for a missing or prefix-less lookup', () => {
    expect(findDetailsCard(details, 'w', 'missing')).toBeNull();
    expect(findDetailsCard(details, 'a', 'AK-12')).toBeNull();
    expect(findDetailsCard(null, 'w', 'AK-12')).toBeNull();
  });

  it('exposes no lookup without a known section prefix', () => {
    const barrel = fs.readFileSync(path.join(process.cwd(), 'app/entities/item/index.ts'), 'utf8');
    expect(barrel).not.toContain('findAnyDetailsCard');
  });
});
