import type { ChatItemRef } from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';

import { renderChatText, renderMarkdown } from '~/features/chat/model/markdown';

const ak: ChatItemRef = {
  token: '@weapon:ак-12',
  kind: 'weapon',
  itemId: 11,
  instanceId: null,
  name: 'АК-12',
  rank: 'common',
  icon: null,
  level: null,
  quality: null,
  virtual: false,
};

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

  it('renders a known item token as an internal link with its name', () => {
    const html = renderMarkdown('сравни @weapon:ак-12 и всё', [ak]);
    expect(html).toContain('class="sz-chat-ref"');
    expect(html).toContain('АК-12</a>');
    expect(html).toContain('href="/weapons?');
    expect(html).not.toContain('target="_blank"');
  });

  it('leaves an unknown token and an escaped label alone', () => {
    expect(renderMarkdown('@weapon:нет-такого', [ak])).toContain('@weapon:нет-такого');
    const unsafe = renderMarkdown('@weapon:ак-12', [{ ...ak, name: '<img src=x>' }]);
    expect(unsafe).not.toContain('<img');
    expect(unsafe).toContain('&lt;img');
  });

  it('renders chips in plain user text without turning it into markdown', () => {
    expect(renderChatText('смотри @weapon:ак-12\n*не курсив*', [ak])).toContain('class="sz-chat-ref"');
    expect(renderChatText('смотри @weapon:ак-12\n*не курсив*', [ak])).toContain('*не курсив*');
    expect(renderChatText('@weapon:нет', [ak])).toBe('@weapon:нет');
    expect(renderChatText('<b>@weapon:ак-12</b>', [ak])).toContain('&lt;b&gt;');
  });
});
