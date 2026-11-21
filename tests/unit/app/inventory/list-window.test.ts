import { describe, expect, it } from 'vitest';

import { windowSections } from '~/features/inventory/model/listWindow';

describe('list window', () => {
  const sections = [
    { key: 'a', label: 'A', rows: [1, 2, 3], total: 3 },
    { key: 'b', label: 'B', rows: [4, 5] },
    { key: 'c', label: 'C', rows: [6] },
  ];

  it('takes one window across groups in their sorted order', () => {
    const first = windowSections(sections, 4);
    expect(first.sections).toEqual([
      { key: 'a', label: 'A', rows: [1, 2, 3], total: 3 },
      { key: 'b', label: 'B', rows: [4], total: 2 },
    ]);
    expect(first.hidden).toBe(2);

    const more = windowSections(sections, 10);
    expect(more.sections.flatMap((section) => section.rows)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(more.hidden).toBe(0);
  });

  it('shows nothing and reports everything hidden at zero', () => {
    expect(windowSections(sections, 0)).toEqual({ sections: [], hidden: 6 });
  });
});
