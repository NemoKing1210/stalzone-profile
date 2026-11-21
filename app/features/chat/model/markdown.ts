import type { ChatItemRef } from '@profile/shared/contracts';
import MarkdownIt from 'markdown-it';
import { chatItemHref } from './render';

/**
 * One renderer for assistant prose. `html: false` is the security boundary: raw HTML from the
 * model is escaped, so no sanitizer pass can be forgotten. Links keep markdown-it's protocol
 * allow-list (`javascript:`, `file:` and `data:` are rejected) and every external target gets
 * `noopener noreferrer nofollow`. Known item tokens become internal chips.
 */
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });

const LANGUAGE = /^[a-z0-9+#.-]{1,24}$/i;
const ITEM_TOKEN = /^@[a-z]+:[\p{L}\p{N}-]+(?:[#~]\d+)?/u;
const ITEM_TOKEN_ANY = /@[a-z]+:[\p{L}\p{N}-]+(?:[#~]\d+)?/gu;

interface ChatMarkdownEnv {
  refs?: Map<string, ChatItemRef>;
}

function refMap(refs: readonly ChatItemRef[]): Map<string, ChatItemRef> {
  const map = new Map<string, ChatItemRef>();
  for (const ref of refs) if (!map.has(ref.token)) map.set(ref.token, ref);
  return map;
}

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

/** A known token becomes an internal link; an unknown one stays ordinary prose. */
markdown.inline.ruler.before('link', 'chat_item_ref', (state, silent) => {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 0x40) return false;
  if (start > 0 && /[\p{L}\p{N}_]/u.test(state.src[start - 1]!)) return false;
  const match = ITEM_TOKEN.exec(state.src.slice(start));
  if (!match) return false;
  const ref = (state.env as ChatMarkdownEnv).refs?.get(match[0]);
  if (!ref) return false;
  if (!silent) {
    const token = state.push('chat_item_ref', '', 0);
    token.content = ref.name;
    const href = chatItemHref(ref.kind, ref.instanceId, ref.name);
    token.meta = href ? { href } : null;
  }
  state.pos = start + match[0].length;
  return true;
});

markdown.renderer.rules.chat_item_ref = (tokens, index) => {
  const token = tokens[index];
  if (!token) return '';
  const meta: unknown = token.meta;
  const href =
    meta && typeof meta === 'object' && 'href' in meta && typeof meta.href === 'string' ? meta.href : null;
  const label = markdown.utils.escapeHtml(token.content);
  if (!href) return label;
  return `<a class="sz-chat-ref" href="${markdown.utils.escapeHtml(href)}">${label}</a>`;
};

export function renderMarkdown(text: string, refs: readonly ChatItemRef[] = []): string {
  const env: ChatMarkdownEnv = { refs: refMap(refs) };
  return markdown.render(text, env);
}

/** User text stays literal (no markdown), but known tokens still link. */
export function renderChatText(text: string, refs: readonly ChatItemRef[] = []): string {
  const map = refMap(refs);
  let out = '';
  let last = 0;
  for (const match of text.matchAll(ITEM_TOKEN_ANY)) {
    const start = match.index ?? 0;
    if (start > 0 && /[\p{L}\p{N}_]/u.test(text[start - 1]!)) continue;
    const ref = map.get(match[0]);
    if (!ref) continue;
    out += markdown.utils.escapeHtml(text.slice(last, start));
    const href = chatItemHref(ref.kind, ref.instanceId, ref.name);
    const label = markdown.utils.escapeHtml(ref.name);
    out += href
      ? `<a class="sz-chat-ref" href="${markdown.utils.escapeHtml(href)}">${label}</a>`
      : label;
    last = start + match[0].length;
  }
  return out + markdown.utils.escapeHtml(text.slice(last));
}
