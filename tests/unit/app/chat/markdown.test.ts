import { describe, expect, it } from 'vitest';

import { renderMarkdown } from '~/features/chat/model/markdown';

describe('chat markdown', () => {
  it('renders blocks and escapes raw HTML', () => {
    expect(renderMarkdown('# Hi')).toContain('<h1>Hi</h1>');
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
    expect(renderMarkdown('<script>alert(1)</script>')).not.toContain('<script');
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).not.toContain('<img');
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).toContain('&lt;img');
  });

  it('drops unsafe links and hardens safe ones', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('href="javascript:');
    expect(renderMarkdown('[x](data:text/html,<b>)')).not.toContain('href="data:');
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a ');
    const link = renderMarkdown('[x](https://example.com)');
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer nofollow"');
  });

  it('keeps code, tables and inline code', () => {
    expect(renderMarkdown('```sql\nselect 1\n```')).toContain('class="language-sql"');
    expect(renderMarkdown('```\nplain\n```')).toContain('<pre><code>');
    expect(renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |')).toContain('<table>');
    expect(renderMarkdown('`x`')).toContain('<code>x</code>');
  });

  it('keeps line breaks as the provider wrote them', () => {
    expect(renderMarkdown('one\ntwo')).toContain('one<br>');
  });

  it('rejects an unsafe code fence label', () => {
    expect(renderMarkdown('```"><img src=x>\ncode\n```')).not.toContain('<img');
  });
});
