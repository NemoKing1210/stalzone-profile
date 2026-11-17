import type { ClientLogConfig, ClientLogEntry } from '@profile/shared/contracts';

const DEDUPE_WINDOW_MS = 5_000;
const HYDRATION = /hydration/i;

/** A failed config request is retried after this delay. */
export const CONFIG_RETRY_MS = 10_000;
/** A loaded config is refreshed after this delay, so settings changes apply. */
export const CONFIG_TTL_MS = 60_000;

/**
 * True when entries must still be kept. `null` means the config request has not
 * succeeded yet: early hydration errors must survive until it does.
 */
export function retainsPending(config: Pick<ClientLogConfig, 'enabled' | 'captureClient'> | null): boolean {
  return config === null || (config.enabled && config.captureClient);
}

/** Decides whether another config request is due, from load and attempt times. */
export function shouldLoadConfig(
  loaded: boolean,
  loadedAt: number,
  attemptedAt: number,
  now: number,
): boolean {
  return loaded ? now - loadedAt >= CONFIG_TTL_MS : now - attemptedAt >= CONFIG_RETRY_MS;
}

/**
 * Hydration mismatches are always captured: they are actionable defects as soon
 * as they happen. Other console lines only when the owner opts into full capture.
 */
export function shouldCaptureConsole(message: string, fullConsole: boolean): boolean {
  return fullConsole || HYDRATION.test(message);
}

function firstFrame(stack: string | null | undefined): string {
  if (!stack) return '';
  const frame = stack
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('Error'));
  return frame ?? '';
}

export function dedupeKey(entry: Pick<ClientLogEntry, 'level' | 'message' | 'stack'>): string {
  return `${entry.level}\n${entry.message}\n${firstFrame(entry.stack)}`;
}

/** Expired keys are pruned past this size, so long-lived tabs do not leak memory. */
const SEEN_PRUNE_AT = 64;

/** True when the entry was not seen in the last five seconds; records it when sent. */
export function shouldSend(
  entry: Pick<ClientLogEntry, 'level' | 'message' | 'stack'>,
  seen: Map<string, number>,
  now: number,
): boolean {
  const key = dedupeKey(entry);
  const last = seen.get(key);
  if (last != null && now - last < DEDUPE_WINDOW_MS) return false;
  seen.set(key, now);
  if (seen.size > SEEN_PRUNE_AT) {
    for (const [other, at] of seen) {
      if (now - at >= DEDUPE_WINDOW_MS) seen.delete(other);
    }
  }
  return true;
}
