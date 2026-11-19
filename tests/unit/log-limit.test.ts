import { expect, it } from 'vitest';
import { fixedWindowLimiter } from '../../server/utils/log-limit';

it('allows the budget, rejects excess and resets after the window', () => {
  const limiter = fixedWindowLimiter(3, 1000);
  expect(limiter.take('a', 2, 0)).toBe(true);
  expect(limiter.take('a', 2, 1)).toBe(false);
  expect(limiter.take('b', 3, 2)).toBe(true);
  expect(limiter.take('a', 1, 1001)).toBe(true);
});

it('keeps an active window when many new keys arrive', () => {
  const limiter = fixedWindowLimiter(5, 60_000);
  for (let attempt = 0; attempt < 5; attempt++) expect(limiter.take('victim', 1, 0)).toBe(true);
  for (let index = 0; index < 4_999; index++) expect(limiter.take(`ip-${index}`, 1, 0)).toBe(true);
  expect(limiter.take('victim', 1, 0)).toBe(false);

  // A new key is refused rather than clearing the table; the victim budget stays intact.
  expect(limiter.take('one-more', 1, 0)).toBe(false);
  expect(limiter.take('victim', 1, 0)).toBe(false);
});
