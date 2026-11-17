import { expect, it } from 'vitest';
import { fixedWindowLimiter } from '../../server/utils/log-limit';

it('allows the budget, rejects excess and resets after the window', () => {
  const limiter = fixedWindowLimiter(3, 1000);
  expect(limiter.take('a', 2, 0)).toBe(true);
  expect(limiter.take('a', 2, 1)).toBe(false);
  expect(limiter.take('b', 3, 2)).toBe(true);
  expect(limiter.take('a', 1, 1001)).toBe(true);
});
