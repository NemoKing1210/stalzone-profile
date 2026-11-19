import type { H3Event } from 'h3';
import { MAX_BODY_BYTES } from './body';
import { apiError, type ApiErrorBody } from './errors';

/** Thrown before the buffer exceeds the budget; routes turn it into the 413 envelope. */
export class BodyTooLargeError extends Error {
  readonly code = 'PAYLOAD_TOO_LARGE';
}

const BODY_CACHE = '__profileJsonBody';

/**
 * Reads and parses a JSON body while counting bytes from the stream. Unlike
 * `readBody`, a chunked request without `Content-Length` cannot grow past `maxBytes`.
 */
export async function readJsonBody(event: H3Event, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  if (BODY_CACHE in event.context) return event.context[BODY_CACHE];

  const req = event.node!.req;
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > maxBytes) {
      // The unread remainder must not be reused on a keep-alive connection.
      event.node!.res?.setHeader('connection', 'close');
      throw new BodyTooLargeError();
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  const value = text.trim() ? JSON.parse(text) : null;
  event.context[BODY_CACHE] = value;
  return value;
}

export type ReadBodyResult = { body: unknown; error?: undefined } | { body?: undefined; error: ApiErrorBody };

/** Same parse, but the 413 is an API envelope and malformed JSON stays a validation failure. */
export async function readJsonBodyResult(
  event: H3Event,
  maxBytes = MAX_BODY_BYTES,
): Promise<ReadBodyResult> {
  try {
    return { body: await readJsonBody(event, maxBytes) };
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return { error: apiError(event, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large') };
    }
    return { body: null };
  }
}
