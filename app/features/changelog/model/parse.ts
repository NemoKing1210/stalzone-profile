import { safeHref } from './links';

export type CategoryKind =
  'added' | 'changed' | 'deprecated' | 'removed' | 'fixed' | 'security' | 'limitations' | 'other';

export interface InlineToken {
  kind: 'text' | 'code' | 'strong' | 'link';
  text: string;
  href?: string;
}

export interface ChangelogItem {
  text: string;
  tokens: InlineToken[];
}

export interface ChangelogSection {
  kind: CategoryKind;
  heading: string;
  items: ChangelogItem[];
}

export interface ChangelogEntry {
  id: string;
  release: string;
  date: string | null;
  title: string;
  sections: ChangelogSection[];
  notes: ChangelogItem[];
}

export interface Changelog {
  title: string;
  intro: string[];
  entries: ChangelogEntry[];
}

const TITLE_HEADING = /^#\s+(.+?)\s*$/;
const ENTRY_HEADING = /^##\s+\[([^\]]+)\](?:\s+[—–-]\s+(.+))?\s*$/;
const CATEGORY_HEADING = /^###\s+(.+?)\s*$/;
const BULLET = /^[-*]\s+(.+)$/;
const LINK_DEFINITION = /^\[[^\]]+\]:\s*\S+/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const CATEGORY_BY_HEADING: Record<string, CategoryKind> = {
  added: 'added',
  changed: 'changed',
  deprecated: 'deprecated',
  removed: 'removed',
  fixed: 'fixed',
  security: 'security',
  'known limitations': 'limitations',
};

/** Split one line of changelog text into code, strong, link and plain tokens. */
export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let rest = text;
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/;

  while (rest.length > 0) {
    const match = pattern.exec(rest);
    if (!match) {
      tokens.push({ kind: 'text', text: rest });
      break;
    }
    if (match.index > 0) tokens.push({ kind: 'text', text: rest.slice(0, match.index) });
    if (match[1] !== undefined) tokens.push({ kind: 'code', text: match[1] });
    else if (match[2] !== undefined) tokens.push({ kind: 'strong', text: match[2] });
    else if (match[3] !== undefined && match[4] !== undefined) {
      const href = safeHref(match[4]);
      if (href) tokens.push({ kind: 'link', text: match[3], href });
      else tokens.push({ kind: 'text', text: match[3] });
    }
    rest = rest.slice(match.index + match[0].length);
  }

  return tokens;
}

function item(text: string): ChangelogItem {
  return { text, tokens: tokenizeInline(text) };
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'entry'
  );
}

function categoryKind(heading: string): CategoryKind {
  return CATEGORY_BY_HEADING[heading.trim().toLowerCase()] ?? 'other';
}

function joinLines(lines: string[]): string {
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parse the repository changelog. The format is the one described in `CHANGELOG.md`:
 * a title, intro paragraphs, dated `##` entries, `###` categories, wrapped bullets and
 * optional italic notes. Link reference definitions are ignored.
 */
export function parseChangelog(markdown: string): Changelog {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const changelog: Changelog = { title: '', intro: [], entries: [] };
  const usedIds = new Set<string>();

  let entry: ChangelogEntry | null = null;
  let section: ChangelogSection | null = null;
  let itemLines: string[] | null = null;
  let noteLines: string[] | null = null;
  let introLines: string[] = [];
  let seenEntry = false;

  const flushItem = (): void => {
    if (!itemLines) return;
    const text = joinLines(itemLines);
    itemLines = null;
    if (text && section) section.items.push(item(text));
  };

  const flushNote = (): void => {
    if (!noteLines) return;
    const text = joinLines(noteLines);
    noteLines = null;
    if (text && entry) entry.notes.push(item(text));
  };

  const flushIntro = (): void => {
    const text = joinLines(introLines);
    introLines = [];
    if (text) changelog.intro.push(text);
  };

  const ensureSection = (): ChangelogSection | null => {
    if (!entry) return null;
    if (!section) {
      section = { kind: 'other', heading: 'Other', items: [] };
      entry.sections.push(section);
    }
    return section;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushItem();
      flushNote();
      flushIntro();
      continue;
    }

    if (LINK_DEFINITION.test(line)) continue;

    if (!seenEntry) {
      const titleMatch = TITLE_HEADING.exec(line);
      if (titleMatch && !changelog.title) {
        changelog.title = titleMatch[1]!;
        continue;
      }
    }

    const entryMatch = ENTRY_HEADING.exec(line);
    if (entryMatch) {
      flushItem();
      flushNote();
      flushIntro();

      const release = entryMatch[1]!.trim();
      const date = DATE.test(release) ? release : null;
      const title = entryMatch[2]?.trim() || release;
      const base = slugify(title === release ? release : `${release}-${title}`);
      let id = base;
      let suffix = 2;
      while (usedIds.has(id)) id = `${base}-${suffix++}`;
      usedIds.add(id);

      entry = { id, release, date, title, sections: [], notes: [] };
      section = null;
      seenEntry = true;
      changelog.entries.push(entry);
      continue;
    }

    const categoryMatch = CATEGORY_HEADING.exec(line);
    if (categoryMatch) {
      flushItem();
      flushNote();
      if (entry) {
        section = { kind: categoryKind(categoryMatch[1]!), heading: categoryMatch[1]!.trim(), items: [] };
        entry.sections.push(section);
      }
      continue;
    }

    const bulletMatch = BULLET.exec(line);
    if (bulletMatch) {
      flushItem();
      flushNote();
      if (entry && ensureSection()) itemLines = [bulletMatch[1]!];
      continue;
    }

    if (line.startsWith('_')) {
      flushItem();
      flushNote();
      if (!entry) {
        introLines.push(line);
        continue;
      }
      const body = line.slice(1);
      if (body.endsWith('_')) {
        const text = joinLines([body.slice(0, -1)]);
        if (text) entry.notes.push(item(text));
      } else {
        noteLines = [body];
      }
      continue;
    }

    if (noteLines) {
      if (line.endsWith('_')) {
        noteLines.push(line.slice(0, -1));
        flushNote();
      } else {
        noteLines.push(line);
      }
      continue;
    }

    if (itemLines) {
      itemLines.push(line);
      continue;
    }

    if (!seenEntry) {
      introLines.push(line);
      continue;
    }

    if (entry && ensureSection()) itemLines = [line];
  }

  flushItem();
  flushNote();
  flushIntro();

  return changelog;
}
