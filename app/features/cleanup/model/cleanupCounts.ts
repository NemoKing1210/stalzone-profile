export interface CleanupCountsLike {
  owned: { records: number; copies: number };
  builds: number;
}

export interface CleanupCountsView {
  known: boolean;
  records: number;
  copies: number;
  builds: number;
}

/**
 * A pending or failed count request means "unknown", never zero: zero is a real
 * measurement and must not stand in for missing data.
 */
export function cleanupCountsView(
  status: string | null | undefined,
  counts: CleanupCountsLike | null | undefined,
): CleanupCountsView {
  if (status !== 'success' || !counts) return { known: false, records: 0, copies: 0, builds: 0 };
  return {
    known: true,
    records: counts.owned.records,
    copies: counts.owned.copies,
    builds: counts.builds,
  };
}
