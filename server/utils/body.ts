/** Upper bound for a request body, applied before any route reads it. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
/** The assistant turn carries base64 attachments (6 MiB decoded), so it alone gets more. */
export const CHAT_TURN_MAX_BYTES = 12 * 1024 * 1024;

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** The declared-body budget for one path; only the assistant turn carries files. */
export function maxBodyBytes(pathname: string): number {
  return pathname === '/api/v1/chat/turn' ? CHAT_TURN_MAX_BYTES : MAX_BODY_BYTES;
}

/** True when a declared body exceeds the budget; a missing or malformed length is unknown. */
export function bodyTooLarge(
  method: string | undefined,
  contentLength: string | null | undefined,
  maxBytes = MAX_BODY_BYTES,
): boolean {
  if (!method || !WRITE_METHODS.has(method)) return false;
  if (!contentLength) return false;
  const length = Number(contentLength);
  return Number.isFinite(length) && length > maxBytes;
}
