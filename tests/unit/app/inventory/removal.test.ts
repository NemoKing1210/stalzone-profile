import { describe, expect, it } from 'vitest';

import { clampRemoveQty } from '~/features/inventory/model/removal';

describe('clampRemoveQty', () => {
  it('keeps the chosen amount inside the stack', () => {
    expect(clampRemoveQty(20, 5)).toBe(5);
    expect(clampRemoveQty(20, 0)).toBe(1);
    expect(clampRemoveQty(20, 25)).toBe(20);
    expect(clampRemoveQty(20, -3)).toBe(1);
  });

  it('truncates fractional input', () => {
    expect(clampRemoveQty(20, 7.9)).toBe(7);
    expect(clampRemoveQty(20.8, 4)).toBe(4);
  });

  it('falls back to one piece for an empty or unusable value', () => {
    expect(clampRemoveQty(1, Number.NaN)).toBe(1);
    expect(clampRemoveQty(Number.NaN, 2)).toBe(1);
    expect(clampRemoveQty(0, 3)).toBe(1);
  });
});
