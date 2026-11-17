import type { CategoryKind, ChangelogEntry } from './parse';

export interface ChangelogFilter {
  query: string;
  /** Empty means every category. */
  kinds: CategoryKind[];
}

export interface ChangelogGroup {
  /** ISO release date, or `null` for the unreleased entries. */
  date: string | null;
  entries: ChangelogEntry[];
}

/**
 * Collapse adjacent entries that share a release date into one timeline node. The changelog
 * lists several entries per day, and a date is a reading aid only if it appears once.
 * Entries arrive newest first, so equal dates are adjacent.
 */
export function groupEntriesByDate(entries: ChangelogEntry[]): ChangelogGroup[] {
  const groups: ChangelogGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.date) last.entries.push(entry);
    else groups.push({ date: entry.date, entries: [entry] });
  }
  return groups;
}

export function categoryCounts(entries: ChangelogEntry[]): Partial<Record<CategoryKind, number>> {
  const counts: Partial<Record<CategoryKind, number>> = {};
  for (const entry of entries) {
    for (const section of entry.sections) {
      counts[section.kind] = (counts[section.kind] ?? 0) + section.items.length;
    }
  }
  return counts;
}

/** Categories in the order they first appear in the file. */
export function kindsInUse(entries: ChangelogEntry[]): CategoryKind[] {
  const kinds: CategoryKind[] = [];
  for (const entry of entries) {
    for (const section of entry.sections) {
      if (!kinds.includes(section.kind)) kinds.push(section.kind);
    }
  }
  return kinds;
}

/** Entries that actually have content, so an empty Unreleased does not count. */
export function populatedEntries(entries: ChangelogEntry[]): ChangelogEntry[] {
  return entries.filter((entry) => entry.sections.length > 0 || entry.notes.length > 0);
}

/**
 * Apply the category and text filters. Both filters narrow what is shown; entries without
 * a single matching section (or without any content at all) are dropped.
 */
export function filterChangelog(entries: ChangelogEntry[], filter: ChangelogFilter): ChangelogEntry[] {
  const query = filter.query.trim().toLowerCase();
  const kinds = filter.kinds;
  const filtered: ChangelogEntry[] = [];

  for (const entry of entries) {
    const sections =
      kinds.length > 0 ? entry.sections.filter((section) => kinds.includes(section.kind)) : entry.sections;
    if (sections.length === 0 && entry.notes.length === 0) continue;
    if (kinds.length > 0 && sections.length === 0) continue;

    if (query) {
      const haystack = [
        entry.release,
        entry.title,
        ...sections.flatMap((section) => [section.heading, ...section.items.map((item) => item.text)]),
        ...entry.notes.map((note) => note.text),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) continue;
    }

    filtered.push({ ...entry, sections });
  }

  return filtered;
}
