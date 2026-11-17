export interface FixedWindowLimiter {
  /** Charges `cost` to `key`; false when the window's budget is exhausted. */
  take(key: string, cost?: number, now?: number): boolean;
}

/**
 * In-memory fixed-window budget. Cheap and good enough for one process: a burst
 * resets at the window boundary, and state dies with the process.
 */
export function fixedWindowLimiter(max: number, windowMs = 60_000): FixedWindowLimiter {
  const windows = new Map<string, { start: number; count: number }>();

  return {
    take(key, cost = 1, now = Date.now()) {
      if (windows.size > 5_000) windows.clear();
      const window = windows.get(key);

      if (!window || now - window.start >= windowMs) {
        if (cost > max) return false;
        windows.set(key, { start: now, count: cost });
        return true;
      }
      if (window.count + cost > max) return false;
      window.count += cost;
      return true;
    },
  };
}
