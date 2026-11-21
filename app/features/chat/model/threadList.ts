import type { ChatThread } from '@profile/shared/contracts';

export type ChatThreadGroupKey = 'today' | 'yesterday' | 'earlier';

export interface ChatThreadGroup {
  key: ChatThreadGroupKey;
  threads: ChatThread[];
}

/** Case-insensitive title search; an empty query keeps the stored `updatedAt` order. */
export function filterThreads(threads: readonly ChatThread[], query: string): ChatThread[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...threads];
  return threads.filter((thread) => thread.title.toLocaleLowerCase().includes(needle));
}

function dayKey(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Today / yesterday / earlier by the reader's local calendar, so the list matches what the
 * clock on the wall says. The store already orders threads by `updatedAt` descending; each
 * bucket keeps that order. An unparsable date is "earlier", never an exception.
 */
export function groupThreads(threads: readonly ChatThread[], now: Date): ChatThreadGroup[] {
  const today = dayKey(now);
  const buckets: Record<ChatThreadGroupKey, ChatThread[]> = { today: [], yesterday: [], earlier: [] };
  for (const thread of threads) {
    const date = new Date(thread.updatedAt);
    if (Number.isNaN(date.getTime())) {
      buckets.earlier.push(thread);
      continue;
    }
    const key = dayKey(date);
    if (key === today) buckets.today.push(thread);
    else if (key === today - 86_400_000) buckets.yesterday.push(thread);
    else buckets.earlier.push(thread);
  }
  return (['today', 'yesterday', 'earlier'] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, threads: buckets[key] }));
}
