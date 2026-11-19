export interface FixedWindowLimiter {
  /** Charges `cost` to `key`; false when the window's budget is exhausted. */
  take(key: string, cost?: number, now?: number): boolean;
}

/**
 * In-memory fixed-window budget. Cheap and good enough for one process: a burst
 * resets at the window boundary, and state dies with the process.
 */
const MAX_WINDOWS = 5_000;

export function fixedWindowLimiter(max: number, windowMs = 60_000): FixedWindowLimiter {
  const windows = new Map<string, { start: number; count: number }>();

  return {
    take(key, cost = 1, now = Date.now()) {
      // Drop expired windows first. When the table is still full, refuse a new key
      // instead of clearing it: a clear would hand every active key a fresh budget.
      if (!windows.has(key) && windows.size >= MAX_WINDOWS) {
        for (const [entryKey, window] of windows) {
          if (now - window.start >= windowMs) windows.delete(entryKey);
        }
        if (windows.size >= MAX_WINDOWS) return false;
      }
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
