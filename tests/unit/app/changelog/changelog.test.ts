import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  categoryCounts,
  filterChangelog,
  groupEntriesByDate,
  kindsInUse,
  populatedEntries,
} from '~/features/changelog/model/filter';
import { safeHref } from '~/features/changelog/model/links';
import { parseChangelog, tokenizeInline } from '~/features/changelog/model/parse';

const fixture = `# Changelog

All notable changes are documented here.
The format is based on Keep a Changelog.

## [Unreleased]

### Added

- A new page.
- Inline \`code\`, **bold** and [a link](https://example.com).

## [2026-11-17] — First entry

### Changed

- A wrapped line
  continues here.

### Removed

- Old thing.

### Known limitations

- Nothing yet.

_No API changes; the
fixture is untouched._

## [2026-11-16] — Second entry

### Fixed

- A bug.

[Unreleased]: https://example.com/commits/main
`;

describe('parseChangelog', () => {
  const changelog = parseChangelog(fixture);

  it('reads the title and the intro paragraphs', () => {
    expect(changelog.title).toBe('Changelog');
    expect(changelog.intro).toEqual([
      'All notable changes are documented here. The format is based on Keep a Changelog.',
    ]);
  });

  it('keeps entries newest first with their dates and titles', () => {
    expect(changelog.entries.map((entry) => entry.release)).toEqual(['Unreleased', '2026-11-17', '2026-11-16']);
    expect(changelog.entries.map((entry) => entry.date)).toEqual([null, '2026-11-17', '2026-11-16']);
    expect(changelog.entries[1]!.title).toBe('First entry');
  });

  it('gives every entry a stable anchor id', () => {
    expect(changelog.entries.map((entry) => entry.id)).toEqual([
      'unreleased',
      '2026-11-17-first-entry',
      '2026-11-16-second-entry',
    ]);
  });

  it('classifies the category headings and falls back to other', () => {
    const first = changelog.entries[1]!;
    expect(first.sections.map((section) => section.kind)).toEqual(['changed', 'removed', 'limitations']);
    expect(parseChangelog('## [2026-01-01] — x\n\n### Something\n\n- y\n').entries[0]!.sections[0]!.kind).toBe('other');
  });

  it('joins wrapped bullet lines into one item', () => {
    const changed = changelog.entries[1]!.sections[0]!;
    expect(changed.items).toHaveLength(1);
    expect(changed.items[0]!.text).toBe('A wrapped line continues here.');
  });

  it('reads italic notes that span lines', () => {
    expect(changelog.entries[1]!.notes.map((note) => note.text)).toEqual(['No API changes; the fixture is untouched.']);
  });

  it('does not turn the link reference definition into an entry item', () => {
    const allItems = changelog.entries.flatMap((entry) => entry.sections.flatMap((section) => section.items));
    expect(allItems.some((item) => item.text.includes('commits/main'))).toBe(false);
  });

  it('parses the real CHANGELOG.md', () => {
    const real = fs.readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const parsed = parseChangelog(real);
    expect(parsed.entries.length).toBeGreaterThan(5);
    expect(parsed.entries.filter((entry) => entry.sections.length > 0).length).toBeGreaterThan(5);
    expect(parsed.entries.flatMap((entry) => entry.sections).some((section) => section.kind === 'added')).toBe(true);
  });
});

describe('tokenizeInline', () => {
  it('splits code, strong and link spans out of plain text', () => {
    expect(tokenizeInline('A `b` **c** [d](https://x) e')).toEqual([
      { kind: 'text', text: 'A ' },
      { kind: 'code', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'strong', text: 'c' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: 'd', href: 'https://x' },
      { kind: 'text', text: ' e' },
    ]);
  });

  it('keeps text untouched when there is nothing to format', () => {
    expect(tokenizeInline('plain text')).toEqual([{ kind: 'text', text: 'plain text' }]);
  });

  it('drops the link wrapper when the target is not a safe URL', () => {
    expect(tokenizeInline('[click](javascript:alert)')).toEqual([{ kind: 'text', text: 'click' }]);
    expect(tokenizeInline('[click](data:text/html,x)')).toEqual([{ kind: 'text', text: 'click' }]);
  });
});

describe('safeHref', () => {
  it('keeps http, https, root-relative and anchor links', () => {
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('/docs/API.md')).toBe('/docs/API.md');
    expect(safeHref('#2026-11-17')).toBe('#2026-11-17');
  });

  it('rejects script, data and empty targets', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('JaVaScRiPt:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html,x')).toBeUndefined();
    expect(safeHref('')).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});

describe('populatedEntries', () => {
  it('drops entries without sections or notes, such as an empty Unreleased', () => {
    const entries = parseChangelog(
      '# Changelog\n\n## [Unreleased]\n\n## [2026-01-01] — x\n\n### Fixed\n\n- y\n',
    ).entries;
    expect(populatedEntries(entries).map((entry) => entry.release)).toEqual(['2026-01-01']);
  });
});

describe('CHANGELOG.md format contract', () => {
  const real = parseChangelog(fs.readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8'));

  it('uses only known category headings', () => {
    const unknown = real.entries
      .flatMap((entry) => entry.sections)
      .filter((section) => section.kind === 'other')
      .map((section) => section.heading);
    expect(unknown).toEqual([]);
  });

  it('keeps Unreleased first when present', () => {
    const index = real.entries.findIndex((entry) => entry.date === null);
    if (index !== -1) expect(index).toBe(0);
  });

  it('lists dated entries newest first', () => {
    const dates = real.entries.map((entry) => entry.date).filter((date): date is string => date !== null);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('gives every entry a unique anchor id', () => {
    const ids = real.entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every dated entry and every item real content', () => {
    for (const entry of real.entries.filter((candidate) => candidate.date !== null)) {
      expect(
        entry.sections.some((section) => section.items.length > 0),
        entry.id,
      ).toBe(true);
    }
    for (const item of real.entries.flatMap((entry) => entry.sections.flatMap((section) => section.items))) {
      expect(item.text.trim().length, item.text).toBeGreaterThan(0);
    }
  });
});

describe('changelog filters', () => {
  const entries = parseChangelog(fixture).entries;

  it('counts items per category and lists the kinds in file order', () => {
    expect(categoryCounts(entries)).toEqual({
      added: 2,
      changed: 1,
      removed: 1,
      limitations: 1,
      fixed: 1,
    });
    expect(kindsInUse(entries)).toEqual(['added', 'changed', 'removed', 'limitations', 'fixed']);
  });

  it('keeps only the selected kinds and drops entries without them', () => {
    const filtered = filterChangelog(entries, { query: '', kinds: ['removed'] });
    expect(filtered.map((entry) => entry.release)).toEqual(['2026-11-17']);
    expect(filtered[0]!.sections.map((section) => section.kind)).toEqual(['removed']);
  });

  it('matches the query case-insensitively across titles and items', () => {
    expect(filterChangelog(entries, { query: 'WRAPPED', kinds: [] }).map((entry) => entry.release)).toEqual([
      '2026-11-17',
    ]);
    expect(filterChangelog(entries, { query: 'absent', kinds: [] })).toEqual([]);
  });

  it('returns every entry when both filters are empty', () => {
    expect(filterChangelog(entries, { query: '', kinds: [] })).toHaveLength(3);
  });
});

describe('changelog timeline groups', () => {
  it('groups entries by release date and keeps the file order', () => {
    const entries = parseChangelog(fixture).entries;
    const groups = groupEntriesByDate(entries);
    expect(groups.map((group) => group.date)).toEqual([null, '2026-11-17', '2026-11-16']);
    expect(groups.map((group) => group.entries.length)).toEqual([1, 1, 1]);
    expect(groups[1]!.entries[0]).toBe(entries[1]);
  });

  it('collects repeated dates and every unreleased entry into one group', () => {
    const entries = parseChangelog(
      [
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        '### Added',
        '',
        '- a',
        '',
        '## [Unreleased]',
        '',
        '### Added',
        '',
        '- b',
        '',
        '## [2026-01-02] — x',
        '',
        '### Fixed',
        '',
        '- y',
        '',
        '## [2026-01-02] — z',
        '',
        '### Fixed',
        '',
        '- w',
      ].join('\n'),
    ).entries;
    const groups = groupEntriesByDate(entries);
    expect(groups.map((group) => group.date)).toEqual([null, '2026-01-02']);
    expect(groups.map((group) => group.entries.length)).toEqual([2, 2]);
  });

  it('returns no groups for an empty list', () => {
    expect(groupEntriesByDate([])).toEqual([]);
  });
});
