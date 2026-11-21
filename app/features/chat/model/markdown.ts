import MarkdownIt from 'markdown-it';

/**
 * One renderer for assistant prose. `html: false` is the security boundary: raw HTML from the
 * model is escaped, so no sanitizer pass can be forgotten. Links keep markdown-it's protocol
 * allow-list (`javascript:`, `file:` and `data:` are rejected) and every external target gets
 * `noopener noreferrer nofollow`.
 */
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });

const LANGUAGE = /^[a-z0-9+#.-]{1,24}$/i;

markdown.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  const token = tokens[index];
  if (!token) return '';
  const href = token.attrGet('href') ?? '';
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer nofollow');
  }
  return self.renderToken(tokens, index, options);
};

markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  if (!token) return '';
  const info = (token.info ?? '').trim().split(/\s+/)[0] ?? '';
  const language = LANGUAGE.test(info) ? info.toLowerCase() : '';
  const className = language ? ` class="language-${language}"` : '';
  return `<pre><code${className}>${markdown.utils.escapeHtml(token.content)}</code></pre>\n`;
};

export function renderMarkdown(text: string): string {
  return markdown.render(text);
}
