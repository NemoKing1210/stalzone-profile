const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Keep rendered changelog links to safe targets: http(s), root-relative and anchor links.
 * A `javascript:` or `data:` URL falls back to plain text instead of an `<a href>`.
 */
export function safeHref(href: string | undefined): string | undefined {
  const value = href?.trim();
  if (!value) return undefined;
  if (value.startsWith('#')) return value;

  try {
    const url = new URL(value, 'https://changelog.invalid/');
    return SAFE_PROTOCOLS.has(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}
