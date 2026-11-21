import { describe, expect, it, vi } from 'vitest';

import { prefersReducedMotion, runViewTransition } from '~/shared/lib/motion';

describe('motion helpers', () => {
  it('reads only the reduced-motion media query', () => {
    expect(prefersReducedMotion({ matchMedia: (query) => ({ matches: query.includes('reduce') }) })).toBe(true);
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(prefersReducedMotion({})).toBe(false);
  });

  it('runs the callback instantly when the API is missing', () => {
    const callback = vi.fn();
    expect(runViewTransition(callback, {})).toBe(false);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('runs the callback instantly when reduced motion is requested', () => {
    const callback = vi.fn();
    const start = vi.fn();
    expect(
      runViewTransition(callback, {
        document: { startViewTransition: start },
        matchMedia: () => ({ matches: true }),
      }),
    ).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('starts a view transition when the API exists and motion is allowed', () => {
    const callback = vi.fn();
    const start = vi.fn();
    expect(
      runViewTransition(callback, {
        document: { startViewTransition: start },
        matchMedia: () => ({ matches: false }),
      }),
    ).toBe(true);
    expect(start).toHaveBeenCalledWith(callback);
    expect(callback).not.toHaveBeenCalled();
  });
});
