import { describe, expect, it } from 'vitest';
import {
  CONFIG_RETRY_MS,
  CONFIG_TTL_MS,
  dedupeKey,
  retainsPending,
  shouldCaptureConsole,
  shouldLoadConfig,
  shouldSend,
} from '~/features/logs/model/clientCapture';

describe('client capture helpers', () => {
  it('always forwards hydration messages and only the rest with full console capture', () => {
    expect(shouldCaptureConsole('Hydration completed but contains mismatches.', false)).toBe(true);
    expect(shouldCaptureConsole('hydration mismatch at <div>', false)).toBe(true);
    expect(shouldCaptureConsole('some other warning', false)).toBe(false);
    expect(shouldCaptureConsole('some other warning', true)).toBe(true);
  });

  it('keeps entries while the config is unknown and drops them only when capture is off', () => {
    expect(retainsPending(null)).toBe(true);
    expect(retainsPending({ enabled: true, captureClient: true })).toBe(true);
    expect(retainsPending({ enabled: true, captureClient: false })).toBe(false);
    expect(retainsPending({ enabled: false, captureClient: true })).toBe(false);
  });

  it('retries the config after a failure and refreshes it after the TTL', () => {
    expect(CONFIG_RETRY_MS).toBe(10_000);
    expect(CONFIG_TTL_MS).toBe(60_000);
    expect(shouldLoadConfig(false, 0, 0, 9_999)).toBe(false);
    expect(shouldLoadConfig(false, 0, 0, 10_000)).toBe(true);
    expect(shouldLoadConfig(true, 1_000, 1_000, 60_999)).toBe(false);
    expect(shouldLoadConfig(true, 1_000, 1_000, 61_000)).toBe(true);
  });

  it('deduplicates the same level/message/first frame within five seconds', () => {
    const seen = new Map<string, number>();
    const entry = { level: 'error' as const, message: 'boom', stack: 'Error: boom\n    at a.ts:1:1' };
    const key = dedupeKey(entry);
    expect(shouldSend(entry, seen, 0)).toBe(true);
    seen.set(key, 0);
    expect(shouldSend(entry, seen, 4000)).toBe(false);
    expect(shouldSend(entry, seen, 6000)).toBe(true);
  });

  it('forgets expired dedupe keys so the map cannot grow without bound', () => {
    const seen = new Map<string, number>();
    for (let index = 0; index < 100; index += 1) seen.set(`old-${index}`, 0);
    shouldSend({ level: 'error', message: 'new', stack: null }, seen, 10_000);
    expect(seen.size).toBe(1);
    expect(seen.has('old-0')).toBe(false);
  });
});
