import { describe, expect, it } from 'vitest';
import { DUMMY_HP, displayDmg, displayDps, displayTtk, dps, ttk } from '@profile/shared/calc';
import { displayDps as coreDisplayDps, displayTtk as coreDisplayTtk } from '@profile/core';

describe('shared weapon math', () => {
  it('is the one formula the server re-exports', () => {
    expect(DUMMY_HP).toBe(600);
    expect(dps(56.631096, 500)).toBe(471.9);
    expect(ttk(56.631096, 500)).toBe(1.2);
    expect(displayDmg(56.631096)).toBe(56.6);
    expect(displayDps(56.631096, 500)).toBe(472);
    expect(displayTtk(10, 600)).toBe(5.9);
    expect(coreDisplayDps).toBe(displayDps);
    expect(coreDisplayTtk).toBe(displayTtk);
  });

  it('computes TTK against the chosen dummy HP', () => {
    expect(ttk(50, 600, 1200)).toBe(2.3);
    expect(displayTtk(50, 600, 300)).toBe(0.5);
    expect(ttk(50, 600, 50)).toBe(0);
    expect(ttk(null, 600, 1200)).toBeNull();
  });
});
