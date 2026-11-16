import { describe, expect, it } from 'vitest';
import { formatDateValue } from '../../app/utils/formatDateValue';

describe('formatDateValue', () => {
  it('returns a dash for a missing value', () => {
    expect(formatDateValue(null, 'en-US')).toBe('—');
    expect(formatDateValue('', 'en-US')).toBe('—');
    expect(formatDateValue('   ', 'en-US')).toBe('—');
  });

  it('keeps a stored non-ISO value trimmed instead of inventing a date', () => {
    expect(formatDateValue('  15.11.2025  ', 'en-US')).toBe('15.11.2025');
  });

  it('formats a parseable ISO timestamp', () => {
    expect(formatDateValue('2025-11-15T12:00:00.000Z', 'en-US')).toContain('2025');
  });
});
