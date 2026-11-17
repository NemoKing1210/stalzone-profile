/**
 * Pure host helpers for the Origin check. They live apart from `auth.ts` so the
 * comparison rules can be unit-tested without an h3 event or runtime config.
 */

/** Host (with a non-default port) of an Origin header; an unparseable value becomes ''. */
export function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return '';
  }
}

/** Host comparison ignores header casing and the default port. */
export function normalizedHost(value: string): string {
  return value.trim().toLowerCase().replace(/:(?:80|443)$/, '');
}

/** True when the Origin header names exactly the host the request arrived on. */
export function isSameOrigin(origin: string, host: string): boolean {
  const originHost = normalizedHost(hostOf(origin));
  return originHost !== '' && originHost === normalizedHost(host);
}
