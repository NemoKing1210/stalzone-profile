import { describe, expect, it } from 'vitest';
import {
  FLUSH_AFTER_ENTRIES,
  FLUSH_INTERVAL_MS,
  QUEUE_HARD_LIMIT,
  backpressureLevels,
  flushDelayFor,
  isQueueFull,
  shouldDrop,
} from '@profile/core';

const LIMITS = { debug: 5000, info: 10000 };

describe('backpressure', () => {
  it('never drops warn or error under level backpressure and drops debug before info', () => {
    expect(backpressureLevels(4999, LIMITS)).toEqual([]);
    expect(backpressureLevels(5000, LIMITS)).toEqual(['debug']);
    expect(backpressureLevels(10000, LIMITS)).toEqual(['debug', 'info']);
  });

  it('marks the queue hard-full only at its absolute cap', () => {
    expect(QUEUE_HARD_LIMIT).toBe(10000);
    expect(isQueueFull(9999)).toBe(false);
    expect(isQueueFull(10000)).toBe(true);
  });

  it('drops warn and error only when the queue is hard-full', () => {
    expect(shouldDrop('error', 9999)).toBe(false);
    expect(shouldDrop('warn', 9999)).toBe(false);
    expect(shouldDrop('info', 5000)).toBe(false);
    expect(shouldDrop('debug', 5000)).toBe(true);
    expect(shouldDrop('info', 10000)).toBe(true);
    expect(shouldDrop('warn', 10000)).toBe(true);
    expect(shouldDrop('error', 10000)).toBe(true);
  });
});

describe('flush scheduling', () => {
  it('flushes warn/error immediately and info within a second', () => {
    expect(flushDelayFor('error', 1)).toBe(0);
    expect(flushDelayFor('warn', 1)).toBe(0);
    expect(flushDelayFor('info', 1)).toBe(FLUSH_INTERVAL_MS);
    expect(flushDelayFor('debug', 199)).toBe(FLUSH_INTERVAL_MS);
  });

  it('forces an immediate flush when the batch reaches 200 entries', () => {
    expect(FLUSH_AFTER_ENTRIES).toBe(200);
    expect(flushDelayFor('info', 200)).toBe(0);
    expect(flushDelayFor('debug', 200)).toBe(0);
  });
});
