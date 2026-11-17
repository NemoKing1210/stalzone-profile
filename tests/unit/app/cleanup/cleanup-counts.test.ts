import { describe, expect, it } from 'vitest';
import { cleanupCountsView } from '../../../../app/features/cleanup/model/cleanupCounts';

const counts = { owned: { records: 6, copies: 8 } };

describe('cleanupCountsView', () => {
  it('treats pending and failed requests as unknown, not zero', () => {
    expect(cleanupCountsView('pending', counts)).toEqual({ known: false, records: 0, copies: 0 });
    expect(cleanupCountsView('error', counts)).toEqual({ known: false, records: 0, copies: 0 });
    expect(cleanupCountsView('success', null)).toEqual({ known: false, records: 0, copies: 0 });
  });

  it('exposes real numbers only after a successful response', () => {
    expect(cleanupCountsView('success', counts)).toEqual({ known: true, records: 6, copies: 8 });
  });

  it('reports real zeros after a successful response', () => {
    expect(cleanupCountsView('success', { owned: { records: 0, copies: 0 } })).toEqual({
      known: true,
      records: 0,
      copies: 0,
    });
  });
});
