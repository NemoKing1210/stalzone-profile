import type { LogRecord, SanitizedRecord } from './types.js';

const MESSAGE_MAX = 4096;
const STACK_MAX = 8192;
const CONTEXT_MAX = 16384;
const VALUE_MAX = 2048;
const DEPTH_MAX = 4;

const SECRET_KEY =
  /(pass(word)?|secret|token|auth|cookie|session|api[-_]?key|client[-_]?secret|credential)/i;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const ABSOLUTE_URL = /(https?|wss?):\/\/[^\s"'<>]+/gi;
const RELATIVE_URL = /(\/[^\s"'<>?]*)\?[^\s"'<>]*/g;

/** Truncates to a UTF-8 byte budget, reserving the ellipsis. */
export function truncateBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text) <= maxBytes) return text;
  const slice = Buffer.from(text).subarray(0, Math.max(0, maxBytes - 3)).toString('utf8');
  return `${slice}…`;
}

/** Removes query strings and bearer credentials from free text. */
export function redactText(text: string): string {
  return text
    .replace(BEARER, 'Bearer [redacted]')
    .replace(ABSOLUTE_URL, (raw) => {
      try {
        const url = new URL(raw);
        return url.search ? `${url.origin}${url.pathname}?…` : raw;
      } catch {
        return raw;
      }
    })
    .replace(RELATIVE_URL, '$1?…');
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return truncateBytes(redactText(value), VALUE_MAX);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value !== 'object') return truncateBytes(String(value), VALUE_MAX);
  if (depth >= DEPTH_MAX) return '[truncated]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) ? '[redacted]' : redactValue(entry, depth + 1, seen);
  }
  return out;
}

/** Redacts keys and values recursively; the caller stores the result as JSON. */
export function redactContext(value: unknown, depth = 0): unknown {
  return redactValue(value, depth, new WeakSet());
}

function capContext(value: unknown): unknown {
  if (value === undefined) return null;
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) <= CONTEXT_MAX) return value;
  return { truncated: true, preview: truncateBytes(redactText(json), CONTEXT_MAX - 30) };
}

/** Redacts and truncates one record before it reaches the queue or the fingerprint. */
export function sanitizeRecord(record: LogRecord): SanitizedRecord {
  const stack = record.stack ? truncateBytes(redactText(record.stack), STACK_MAX) : null;
  return {
    level: record.level,
    category: record.category,
    message: truncateBytes(redactText(record.message), MESSAGE_MAX),
    context: capContext(record.context === undefined ? null : redactContext(record.context)),
    stack,
    requestId: record.requestId ?? null,
    durationMs: record.durationMs ?? null,
    at: record.at,
    source: record.source,
  };
}
