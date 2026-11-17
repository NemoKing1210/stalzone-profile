import { describe, expect, it } from 'vitest';
import { cleanupCountsView } from '../../../../app/features/cleanup/model/cleanupCounts';

const counts = {
  owned: { records: 6, copies: 8 },
  manualStats: { records: 2 },
  character: { present: true, nick: 'tester' },
  journal: { events: 3 },
};

const unknown = {
  known: false,
  records: 0,
  copies: 0,
  manualStats: 0,
  character: { present: false, nick: null },
  journal: 0,
};

describe('cleanupCountsView', () => {
  it('treats pending and failed requests as unknown, not zero', () => {
    expect(cleanupCountsView('pending', counts)).toEqual(unknown);
    expect(cleanupCountsView('error', counts)).toEqual(unknown);
    expect(cleanupCountsView('success', null)).toEqual(unknown);
  });

  it('exposes every scope after a successful response', () => {
    expect(cleanupCountsView('success', counts)).toEqual({
      known: true,
      records: 6,
      copies: 8,
      manualStats: 2,
      character: { present: true, nick: 'tester' },
      journal: 3,
    });
  });

  it('reports real zeros after a successful response', () => {
    expect(
      cleanupCountsView('success', {
        owned: { records: 0, copies: 0 },
        manualStats: { records: 0 },
        character: { present: false, nick: null },
        journal: { events: 0 },
      }),
    ).toEqual({
      known: true,
      records: 0,
      copies: 0,
      manualStats: 0,
      character: { present: false, nick: null },
      journal: 0,
    });
  });
});
