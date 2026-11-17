export interface CleanupCountsLike {
  owned: { records: number; copies: number };
  manualStats: { records: number };
  character: { present: boolean; nick: string | null };
  journal: { events: number };
}

export interface CleanupCountsView {
  known: boolean;
  records: number;
  copies: number;
  manualStats: number;
  character: { present: boolean; nick: string | null };
  journal: number;
}

function unknown(): CleanupCountsView {
  return {
    known: false,
    records: 0,
    copies: 0,
    manualStats: 0,
    character: { present: false, nick: null },
    journal: 0,
  };
}

/**
 * A pending or failed count request means "unknown", never zero: zero is a real
 * measurement and must not stand in for missing data.
 */
export function cleanupCountsView(
  status: string | null | undefined,
  counts: CleanupCountsLike | null | undefined,
): CleanupCountsView {
  if (status !== 'success' || !counts) return unknown();
  return {
    known: true,
    records: counts.owned.records,
    copies: counts.owned.copies,
    manualStats: counts.manualStats.records,
    character: counts.character,
    journal: counts.journal.events,
  };
}
