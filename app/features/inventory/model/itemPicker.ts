import { CAT_RU } from '@profile/shared/ranks';

/** The catalog fields the add-item picker renders; a subset of `ItemSummary`. */
export interface PickerItem {
  id: number;
  name: string;
  nameEn?: string | null;
  kind: string;
  category: string | null;
  rank: string | null;
  slot: string | null;
  weight: number | null;
  icon: string | null;
}

/** One run of result text, split so the matching part can be painted. */
export interface HighlightSegment {
  text: string;
  match: boolean;
}

/** Motifs, styles and cosmetic variants stay catalog-only; the add form creates owned instances. */
export function isOwnableCatalogItem(item: { kind: string; category?: string | null; cosmetic?: boolean }): boolean {
  if (item.cosmetic) return false;
  if (item.category === 'styles' || item.category?.includes('_style')) return false;
  return ['weapon', 'armor', 'container', 'artifact', 'modification', 'ammo', 'other'].includes(item.kind);
}

/** The game category path as a readable label; unknown paths keep their last segment. */
export function categoryLabel(category: string | null | undefined): string | null {
  if (!category) return null;
  const translated = CAT_RU[category];
  if (translated) return translated;
  const tail = category.split('/').filter(Boolean).pop();
  return tail ? tail.replace(/_/g, ' ') : category;
}

/**
 * Split a result name into matched and unmatched runs. The server decides which rows
 * appear; this only makes the reason visible, so it must agree with `searchItems` on
 * case and on `ё`/`е`.
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const normalize = (value: string): string => value.toLowerCase().replace(/ё/g, 'е');
  const tokens = normalize(query)
    .split(/\s+/)
    .filter(Boolean);
  if (!text || !tokens.length) return text ? [{ text, match: false }] : [];

  const haystack = normalize(text);
  const marked = new Array<boolean>(text.length).fill(false);
  for (const token of tokens) {
    let from = 0;
    while (from <= haystack.length - token.length) {
      const at = haystack.indexOf(token, from);
      if (at === -1) break;
      marked.fill(true, at, at + token.length);
      from = at + token.length;
    }
  }

  const segments: HighlightSegment[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const match = marked[index]!;
    const last = segments[segments.length - 1];
    if (last && last.match === match) last.text += text[index];
    else segments.push({ text: text[index]!, match });
  }
  return segments;
}

/** Owned instances by catalog name: gear is counted per row, stacks per stack. */
export function ownedInstanceCounts(items: readonly { name: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.name) continue;
    counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
  }
  return counts;
}

/** Arrow-key movement over a result list; `-1` is "nothing active yet". */
export function nextSelectionIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return -1;
  if (index < 0) return delta >= 0 ? 0 : length - 1;
  return (index + delta + length) % length;
}
