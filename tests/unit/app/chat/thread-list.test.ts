import type { ChatThread } from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';

import { filterThreads, groupThreads } from '~/features/chat/model/threadList';

function thread(id: number, title: string, updatedAt: string): ChatThread {
  return { id, title, createdAt: updatedAt, updatedAt };
}

const threads = [
  thread(1, 'Prices today', '2026-11-21T09:00:00.000Z'),
  thread(2, 'Loadout', '2026-11-21T08:00:00.000Z'),
  thread(3, 'Yesterday stash', '2026-11-20T20:00:00.000Z'),
  thread(4, 'Old question', '2026-11-01T12:00:00.000Z'),
];

describe('chat thread list', () => {
  it('filters by title ignoring case and surrounding spaces', () => {
    expect(filterThreads(threads, '  LOADOUT ').map((item) => item.id)).toEqual([2]);
    expect(filterThreads(threads, '').map((item) => item.id)).toEqual([1, 2, 3, 4]);
    expect(filterThreads(threads, 'nothing')).toEqual([]);
  });

  it('groups threads by local calendar day and keeps the stored order', () => {
    const groups = groupThreads(threads, new Date('2026-11-21T12:00:00.000Z'));
    expect(groups.map((group) => group.key)).toEqual(['today', 'yesterday', 'earlier']);
    expect(groups[0]?.threads.map((item) => item.id)).toEqual([1, 2]);
    expect(groups[1]?.threads.map((item) => item.id)).toEqual([3]);
    expect(groups[2]?.threads.map((item) => item.id)).toEqual([4]);
  });

  it('falls back to the earlier bucket for an unparsable date', () => {
    expect(groupThreads([thread(9, 'Broken', 'not-a-date')], new Date('2026-11-21T12:00:00.000Z'))).toEqual([
      { key: 'earlier', threads: [expect.objectContaining({ id: 9 })] },
    ]);
  });
});
