import { describe, expect, it } from 'vitest';

import { nextPane, resolvePane } from '~/features/inventory/model/panes';

describe('left inventory pane', () => {
  it('toggles between equipment and stash', () => {
    expect(nextPane('equipment')).toBe('stash');
    expect(nextPane('stash')).toBe('equipment');
  });

  it('falls back to equipment for a missing or unknown stored value', () => {
    expect(resolvePane('stash')).toBe('stash');
    expect(resolvePane('equipment')).toBe('equipment');
    expect(resolvePane('')).toBe('equipment');
    expect(resolvePane('anything')).toBe('equipment');
  });
});
