/** Upper bound for a request body, applied before any route reads it. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** True when a declared body exceeds the budget; a missing or malformed length is unknown. */
export function bodyTooLarge(method: string | undefined, contentLength: string | null | undefined): boolean {
  if (!method || !WRITE_METHODS.has(method)) return false;
  if (!contentLength) return false;
  const length = Number(contentLength);
  return Number.isFinite(length) && length > MAX_BODY_BYTES;
}
