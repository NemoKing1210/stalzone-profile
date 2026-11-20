import { describe, expect, it } from 'vitest';
import type { EventRead } from '@profile/shared/contracts';
import {
  DIFF_ENTRY_LIMIT,
  EMPTY_EVENT_FILTERS,
  diffEntries,
  eventFacets,
  filterEvents,
  formatDiffValue,
  prettySnapshot,
  type EventFilters,
} from '../../../../app/features/events/model/journal';

function event(overrides: Partial<EventRead>): EventRead {
  return {
    id: 1,
    at: '2026-11-20T12:00:00.000Z',
    actor: 'owner',
    action: 'inventory.item.update',
    entity: 'inventory',
    entityId: '7',
    before: null,
    after: null,
    note: null,
    requestId: null,
    origin: null,
    summary: { kind: 'update', fields: [] },
    ...overrides,
  };
}

const NOW = new Date('2026-11-20T12:00:00.000Z');

function filters(overrides: Partial<EventFilters>): EventFilters {
  return { ...EMPTY_EVENT_FILTERS, ...overrides };
}

describe('event facets', () => {
  it('collects distinct non-null actions, entities and actors in sorted order', () => {
    const facets = eventFacets([
      event({ id: 1, action: 'journal.clear', entity: null, actor: 'owner' }),
      event({ id: 2, action: 'character.create', entity: 'character', actor: 'owner' }),
      event({ id: 3, action: 'inventory.item.update', entity: 'inventory', actor: 'mcp' }),
    ]);
    expect(facets).toEqual({
      actions: ['character.create', 'inventory.item.update', 'journal.clear'],
      entities: ['character', 'inventory'],
      actors: ['mcp', 'owner'],
    });
  });
});

describe('event filters', () => {
  const entries = [
    event({ id: 1, action: 'character.create', entity: 'character', actor: 'owner', at: '2026-11-20T11:00:00.000Z' }),
    event({
      id: 2,
      action: 'inventory.item.update',
      entity: 'inventory',
      actor: 'mcp',
      entityId: '42',
      requestId: 'req-42',
      note: 'level up',
      at: '2026-11-18T12:00:00.000Z',
    }),
    event({ id: 3, action: 'journal.clear', entity: 'journal', actor: 'owner', at: '2026-10-01T12:00:00.000Z' }),
  ];

  it('matches the action, entity and actor exactly', () => {
    expect(filterEvents(entries, filters({ action: 'journal.clear' }), NOW).map((row) => row.id)).toEqual([3]);
    expect(filterEvents(entries, filters({ entity: 'inventory' }), NOW).map((row) => row.id)).toEqual([2]);
    expect(filterEvents(entries, filters({ actor: 'mcp' }), NOW).map((row) => row.id)).toEqual([2]);
  });

  it('searches the entity id, note, request id and origin case-insensitively', () => {
    expect(filterEvents(entries, filters({ text: 'REQ-42' }), NOW).map((row) => row.id)).toEqual([2]);
    expect(filterEvents(entries, filters({ text: 'level up' }), NOW).map((row) => row.id)).toEqual([2]);
    expect(filterEvents(entries, filters({ text: '042' }), NOW).map((row) => row.id)).toEqual([]);
  });

  it('drops entries older than the selected window and keeps unknown dates only for "all"', () => {
    const withBadDate = [...entries, event({ id: 4, at: 'not-a-date' })];
    expect(filterEvents(withBadDate, filters({ window: '24h' }), NOW).map((row) => row.id)).toEqual([1]);
    expect(filterEvents(withBadDate, filters({ window: '7d' }), NOW).map((row) => row.id)).toEqual([1, 2]);
    expect(filterEvents(withBadDate, filters({ window: '30d' }), NOW).map((row) => row.id)).toEqual([1, 2]);
    expect(filterEvents(withBadDate, filters({ window: 'all' }), NOW)).toHaveLength(4);
  });

  it('combines filters and returns every entry when empty', () => {
    expect(filterEvents(entries, filters({ entity: 'journal', actor: 'owner' }), NOW).map((row) => row.id)).toEqual([3]);
    expect(filterEvents(entries, EMPTY_EVENT_FILTERS, NOW)).toHaveLength(3);
  });
});

describe('rollback-snapshot diff', () => {
  it('lists changed nested fields with before and after values', () => {
    const diff = diffEntries(
      { level: 3, quality: 'rare', stats: { kil: 10, dea: 4 } },
      { level: 4, quality: 'rare', stats: { kil: 12, dea: 4 } },
    );
    expect(diff.truncated).toBe(false);
    expect(diff.entries).toEqual([
      { path: 'level', before: 3, after: 4, kind: 'changed' },
      { path: 'stats.kil', before: 10, after: 12, kind: 'changed' },
    ]);
  });

  it('reads a create as added fields and a delete as removed fields', () => {
    expect(diffEntries(null, { nick: 'Owner', region: 'ru' })).toEqual({
      truncated: false,
      entries: [
        { path: 'nick', before: undefined, after: 'Owner', kind: 'added' },
        { path: 'region', before: undefined, after: 'ru', kind: 'added' },
      ],
    });
    expect(diffEntries({ nick: 'Owner' }, null)).toEqual({
      truncated: false,
      entries: [{ path: 'nick', before: 'Owner', after: undefined, kind: 'removed' }],
    });
  });

  it('keeps a non-object root as one entry and ignores identical snapshots', () => {
    expect(diffEntries(['a'], ['b'])).toEqual({
      truncated: false,
      entries: [{ path: '', before: ['a'], after: ['b'], kind: 'changed' }],
    });
    expect(diffEntries({ a: [1, 2] }, { a: [1, 2] })).toEqual({ truncated: false, entries: [] });
    expect(diffEntries(null, null)).toEqual({ truncated: false, entries: [] });
  });

  it('caps the entry list and reports the truncation', () => {
    const before: Record<string, number> = {};
    const after: Record<string, number> = {};
    for (let index = 0; index < DIFF_ENTRY_LIMIT + 5; index++) {
      before[`f${index}`] = index;
      after[`f${index}`] = index + 1;
    }
    const diff = diffEntries(before, after);
    expect(diff.entries).toHaveLength(DIFF_ENTRY_LIMIT);
    expect(diff.truncated).toBe(true);
  });
});

describe('display helpers', () => {
  it('formats long values and leaves JSON scalars intact', () => {
    expect(formatDiffValue(4)).toBe('4');
    expect(formatDiffValue(null)).toBe('null');
    expect(formatDiffValue('x'.repeat(80), 10)).toBe('xxxxxxxxx…');
  });

  it('pretty-prints a snapshot and caps the rendered text', () => {
    expect(prettySnapshot({ a: 1 }).text).toBe('{\n  "a": 1\n}');
    const large = prettySnapshot('x'.repeat(20), 10);
    expect(large).toEqual({ text: '"xxxxxxxxx', truncated: true });
  });
});
