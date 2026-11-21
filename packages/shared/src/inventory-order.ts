import { rankKey, RANK_ORDER } from './ranks.js';

export type TidyOrder = 'kind' | 'name' | 'rank' | 'footprint';

export interface OrderableItem {
  id: number;
  kind: string;
  name: string;
  rank: string | null;
  size: { width: number; height: number };
}

/** The explicit order the owner picks for tidy-up and for a filtered grid view. */
export function orderTidy<T extends OrderableItem>(items: readonly T[], order: TidyOrder): T[] {
  const compare = (a: T, b: T): number => {
    if (order === 'name') return a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' });
    if (order === 'rank') {
      const keyA = rankKey(a.rank);
      const keyB = rankKey(b.rank);
      const weightA = keyA ? RANK_ORDER.indexOf(keyA) : RANK_ORDER.length;
      const weightB = keyB ? RANK_ORDER.indexOf(keyB) : RANK_ORDER.length;
      return weightA - weightB || a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' });
    }
    if (order === 'footprint') {
      const areaA = a.size.width * a.size.height;
      const areaB = b.size.width * b.size.height;
      return (
        areaB - areaA ||
        b.size.height - a.size.height ||
        b.size.width - a.size.width ||
        a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' })
      );
    }
    return (
      a.kind.localeCompare(b.kind, 'en') || a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' })
    );
  };
  return [...items].sort((a, b) => compare(a, b) || a.id - b.id);
}
