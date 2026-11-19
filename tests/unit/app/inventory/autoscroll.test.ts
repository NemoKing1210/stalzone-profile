import { describe, expect, it } from 'vitest';
import type { Point } from '~/features/inventory/model/drag';
import { scrollVelocity } from '~/features/inventory/model/autoscroll';
import type { Size } from '~/features/inventory/model/grid';

const viewport: Size = { width: 1200, height: 800 };

function at(x: number, y: number): Point {
  return { x, y };
}

describe('scrollVelocity', () => {
  it('does not scroll away from the edges', () => {
    expect(scrollVelocity(at(600, 400), viewport)).toEqual({ x: 0, y: 0 });
  });

  it('scrolls down inside the bottom margin, faster nearer the edge', () => {
    const far = scrollVelocity(at(600, 760), viewport);
    const near = scrollVelocity(at(600, 799), viewport);
    expect(far.y).toBeGreaterThan(0);
    expect(near.y).toBeGreaterThan(far.y);
    expect(near.y).toBeLessThanOrEqual(18);
  });

  it('scrolls on both axes in a corner', () => {
    expect(scrollVelocity(at(2, 798), viewport)).toEqual({ x: -18, y: 18 });
  });

  it('keeps scrolling when the pointer is outside the viewport', () => {
    expect(scrollVelocity(at(600, 900), viewport).y).toBe(18);
  });
});
