export interface SortEntry {
  id: string;
  desc: boolean;
}

/**
 * Bridges a UTable sorting model to the persisted `sort`/`dir` filter fields.
 * The getter keeps the table in sync after localStorage restores the filters.
 */
export function usePersistentSorting<T extends { sort: string; dir: string }>(filters: T) {
  return computed<SortEntry[]>({
    get: () => (filters.sort ? [{ id: filters.sort, desc: filters.dir === 'desc' }] : []),
    set: (value) => {
      const first = value[0];
      filters.sort = first?.id ?? '';
      filters.dir = first ? (first.desc ? 'desc' : 'asc') : '';
    },
  });
}
