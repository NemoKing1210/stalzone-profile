import { describe, expect, it } from 'vitest';
import { parseLogFilters, toLogQuery, filtersToRouteQuery } from '~/features/logs/model/filters';

describe('log filters', () => {
  it('round-trips levels, categories, window and text through the route query', () => {
    const filters = {
      levels: ['warn', 'error'] as const,
      categories: ['sync'] as const,
      sources: [] as const,
      window: '24h' as const,
      text: 'boom',
      requestId: '',
      fingerprint: '',
    };
    const route = filtersToRouteQuery(filters);
    expect(parseLogFilters(route)).toEqual({ ...filters, levels: ['warn', 'error'], categories: ['sync'] });
  });

  it('turns the window into an ISO since value and omits empty filters', () => {
    const query = toLogQuery(
      { levels: [], categories: [], sources: [], window: '7d', text: '', requestId: '', fingerprint: '' },
      new Date('2026-11-17T12:00:00.000Z'),
    );
    expect(query).toMatchObject({ since: '2026-11-10T12:00:00.000Z', limit: 50 });
    expect(query.levels).toBeUndefined();
  });
});
