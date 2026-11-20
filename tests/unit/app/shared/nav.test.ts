import { describe, expect, it } from 'vitest';

import { navCounts } from '~/shared/lib/nav';
import type { ProfilePayload } from '~/shared/types/profile';

function payload(counts: { weapons: number; armor: number; containers: number; artifacts: number }): ProfilePayload {
  return {
    weapons: Array.from({ length: counts.weapons }, () => ({})),
    armor: Array.from({ length: counts.armor }, () => ({})),
    containers: Array.from({ length: counts.containers }, () => ({})),
    artifacts: Array.from({ length: counts.artifacts }, () => ({})),
  } as unknown as ProfilePayload;
}

describe('navigation count badges', () => {
  it('shows nothing while the payload is missing', () => {
    expect(navCounts(undefined)).toEqual({ weapons: null, armor: null, containers: null, artifacts: null });
  });

  it('shows zero as a real count', () => {
    expect(navCounts(payload({ weapons: 0, armor: 0, containers: 0, artifacts: 0 }))).toEqual({
      weapons: 0,
      armor: 0,
      containers: 0,
      artifacts: 0,
    });
  });

  it('mirrors the owned-list lengths for one and many', () => {
    expect(navCounts(payload({ weapons: 1, armor: 2, containers: 3, artifacts: 4 }))).toEqual({
      weapons: 1,
      armor: 2,
      containers: 3,
      artifacts: 4,
    });
  });
});
