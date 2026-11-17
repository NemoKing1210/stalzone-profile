import { describe, expect, it } from 'vitest';
import { clampPercent } from '../../app/shared/lib/clampPercent';

describe('clampPercent', () => {
  it('maps a ratio to 0–100', () => {
    expect(clampPercent(38, 90)).toBeCloseTo(42.22, 1);
    expect(clampPercent(0, 90)).toBe(0);
    expect(clampPercent(90, 90)).toBe(100);
  });

  it('clamps out-of-range values and refuses a zero or negative max', () => {
    expect(clampPercent(120, 90)).toBe(100);
    expect(clampPercent(-1, 10)).toBe(0);
    expect(clampPercent(5, 0)).toBe(0);
    expect(clampPercent(5, -1)).toBe(0);
  });
});
