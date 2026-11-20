import { describe, expect, it } from 'vitest';

import { tileGesture } from '~/features/inventory/model/tile';

describe('tileGesture', () => {
  it('selects on a single click and opens on a double click', () => {
    expect(tileGesture('click')).toBe('select');
    expect(tileGesture('dblclick')).toBe('open');
  });
});
