import { describe, expect, it } from 'vitest';

import { stashCreateInput, stashPatchInput } from '~/features/inventory/model/stashForm';

describe('stash form', () => {
  it('trims the name and sends no dimensions', () => {
    expect(stashCreateInput({ name: '  Main stash  ' })).toEqual({ name: 'Main stash' });
  });

  it('builds no patch for an unchanged form', () => {
    expect(stashPatchInput({ name: 'Stash', maxWeight: '' }, { name: 'Stash', maxWeight: null })).toEqual({});
  });

  it('maps an empty weight to null and a number to kilograms', () => {
    expect(stashPatchInput({ name: 'Stash', maxWeight: '' }, { name: 'Stash', maxWeight: 50 })).toEqual({
      maxWeight: null,
    });
    expect(stashPatchInput({ name: 'Stash', maxWeight: '80' }, { name: 'Stash', maxWeight: null })).toEqual({
      maxWeight: 80,
    });
  });

  it('trims a renamed stash and ignores an empty name', () => {
    expect(stashPatchInput({ name: '  Renamed ', maxWeight: '' }, { name: 'Stash', maxWeight: null })).toEqual({
      name: 'Renamed',
    });
    expect(stashPatchInput({ name: '   ', maxWeight: '' }, { name: 'Stash', maxWeight: null })).toEqual({});
  });
});
