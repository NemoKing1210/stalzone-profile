import { Readable } from 'node:stream';
import type { H3Event } from 'h3';
import { describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES, bodyTooLarge } from '../../server/utils/body';
import { BodyTooLargeError, readJsonBody } from '../../server/utils/read-body';

function fakeEvent(body: Buffer, headers: Record<string, string> = {}): H3Event {
  const req = Readable.from([body]);
  Object.assign(req, { headers });
  // The helper only touches `node.req`, `node.res` and `context`; the rest of H3 is unused.
  return { node: { req, res: { setHeader: () => undefined } }, context: {} } as unknown as H3Event;
}

describe('request body limit', () => {
  it('bounds only methods that carry a body', () => {
    expect(bodyTooLarge('GET', String(MAX_BODY_BYTES + 1))).toBe(false);
    expect(bodyTooLarge('HEAD', String(MAX_BODY_BYTES + 1))).toBe(false);
    expect(bodyTooLarge('POST', String(MAX_BODY_BYTES + 1))).toBe(true);
    expect(bodyTooLarge('PATCH', String(MAX_BODY_BYTES + 1))).toBe(true);
    expect(bodyTooLarge('DELETE', String(MAX_BODY_BYTES + 1))).toBe(true);
  });

  it('accepts the budget itself and rejects anything above it', () => {
    expect(bodyTooLarge('POST', String(MAX_BODY_BYTES))).toBe(false);
    expect(bodyTooLarge('POST', String(MAX_BODY_BYTES + 1))).toBe(true);
  });

  it('treats a missing or malformed length as unknown, not oversized', () => {
    expect(bodyTooLarge('POST', undefined)).toBe(false);
    expect(bodyTooLarge('POST', '')).toBe(false);
    expect(bodyTooLarge('POST', 'not-a-number')).toBe(false);
  });
});

describe('streamed JSON body', () => {
  it('parses a body under the budget', async () => {
    await expect(readJsonBody(fakeEvent(Buffer.from('{"ok":true}')))).resolves.toEqual({ ok: true });
  });

  it('rejects a chunked body above the budget instead of buffering it', async () => {
    const event = fakeEvent(Buffer.alloc(MAX_BODY_BYTES + 1, 0x20));
    await expect(readJsonBody(event)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('rejects a declared length above the budget without reading', async () => {
    const event = fakeEvent(Buffer.from('{}'), { 'content-length': String(MAX_BODY_BYTES + 1) });
    await expect(readJsonBody(event)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});
