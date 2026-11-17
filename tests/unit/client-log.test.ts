import { describe, expect, it } from 'vitest';
import { CLIENT_LOG_BATCH_MAX_BYTES } from '@profile/shared/contracts';
import { clientBatchBytes, isClientBatchTooLarge } from '../../server/utils/client-log';

describe('client log batch budget', () => {
  it('measures the JSON body in UTF-8 bytes, not characters', () => {
    const body = { entries: [{ level: 'error', message: 'ж'.repeat(100) }] };
    expect(clientBatchBytes(body)).toBe(Buffer.byteLength(JSON.stringify(body)));
    expect(clientBatchBytes(body)).toBeGreaterThan(100);
  });

  it('rejects a batch over 32 KiB and accepts one at the budget', () => {
    expect(CLIENT_LOG_BATCH_MAX_BYTES).toBe(32768);
    expect(isClientBatchTooLarge({ entries: [{ level: 'error', message: 'x'.repeat(1000) }] })).toBe(false);
    expect(
      isClientBatchTooLarge({ entries: [{ level: 'error', message: 'x'.repeat(CLIENT_LOG_BATCH_MAX_BYTES) }] }),
    ).toBe(true);
  });
});
