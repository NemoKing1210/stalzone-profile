import { describe, expect, it } from 'vitest';
import { isSyncRunning, runExclusive, tryRunExclusive } from '@profile/core';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('sync single-flight lock', () => {
  it('rejects a concurrent run and clears after success', async () => {
    const gate = deferred<undefined>();
    const first = runExclusive(async () => {
      await gate.promise;
      return 'ok';
    });
    expect(isSyncRunning()).toBe(true);
    await expect(runExclusive(async () => 'second')).rejects.toMatchObject({
      status: 409,
      code: 'SYNC_IN_PROGRESS',
    });
    await expect(tryRunExclusive(async () => 'third')).resolves.toBeNull();
    gate.resolve(undefined);
    await expect(first).resolves.toBe('ok');
    expect(isSyncRunning()).toBe(false);
  });

  it('clears after a failure', async () => {
    await expect(
      runExclusive(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(isSyncRunning()).toBe(false);
    await expect(runExclusive(async () => 'after')).resolves.toBe('after');
  });
});
