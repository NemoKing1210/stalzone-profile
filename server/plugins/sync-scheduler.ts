import { runDueBundles, tryRunExclusive } from '@profile/core';
import { useDb } from '../utils/db';
import { serverSyncOptions } from '../utils/sync-options';

const TIMER_KEY = '__profileSyncScheduler';
const BOOT_DELAY_MS = 10_000;
const TICK_MS = 60_000;

type SchedulerTimers = {
  boot: ReturnType<typeof setTimeout>;
  tick: ReturnType<typeof setInterval>;
};

/**
 * One timer per process. The schedule is disabled by default, so a fresh boot performs
 * no network calls until the owner enables a bundle. A busy lock skips the tick instead
 * of queueing a second sync.
 */
export default defineNitroPlugin(() => {
  const db = useDb();
  const globals = globalThis as typeof globalThis & { [TIMER_KEY]?: SchedulerTimers };
  const previous = globals[TIMER_KEY];
  if (previous) {
    clearTimeout(previous.boot);
    clearInterval(previous.tick);
  }

  async function tick(): Promise<void> {
    try {
      await tryRunExclusive(() => runDueBundles(db, serverSyncOptions()));
    } catch (error) {
      console.error('[sync-scheduler] tick failed', error);
    }
  }

  globals[TIMER_KEY] = {
    boot: setTimeout(tick, BOOT_DELAY_MS),
    tick: setInterval(tick, TICK_MS),
  };
});
