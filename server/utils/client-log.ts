import { CLIENT_LOG_BATCH_MAX_BYTES } from '@profile/shared/contracts';

/** Size of the browser batch as it would be serialized, in UTF-8 bytes. */
export function clientBatchBytes(body: unknown): number {
  return Buffer.byteLength(JSON.stringify(body ?? null));
}

/** True when the payload exceeds the documented 32 KiB browser batch budget. */
export function isClientBatchTooLarge(body: unknown): boolean {
  return clientBatchBytes(body) > CLIENT_LOG_BATCH_MAX_BYTES;
}
