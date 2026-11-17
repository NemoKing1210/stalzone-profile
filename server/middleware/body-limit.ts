import { bodyTooLarge } from '../utils/body';
import { apiError } from '../utils/errors';

/**
 * Rejects an oversized declared body before `readBody` runs. Chunked bodies have
 * no `Content-Length` and are still bounded by each route's own validation
 * (MCP 2 MiB, client logs 32 KiB).
 */
export default defineEventHandler((event) => {
  if (bodyTooLarge(event.method, getRequestHeader(event, 'content-length'))) {
    return apiError(event, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
});
