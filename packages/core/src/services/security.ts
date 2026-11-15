/**
 * Key used to count login attempts. `X-Forwarded-For` is client-controlled, so it
 * is honoured only when the deployment says a trusted reverse proxy sets it.
 */
export function loginClientKey(
  remoteAddress: string | null | undefined,
  forwardedFor: string | null | undefined,
  trustProxy: boolean,
): string {
  if (trustProxy && forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const socket = remoteAddress?.trim();
  return socket || 'unknown';
}
