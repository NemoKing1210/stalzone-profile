import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, DEFAULT_ACCENT, normalizeAccent } from '../../app/shared/lib/accents';
import { contrast } from './helpers/contrast';

describe('accent presets', () => {
  it('offers exactly the five approved presets with green as default', () => {
    expect(ACCENT_PRESETS.map((preset) => preset.id)).toEqual(['green', 'amber', 'blue', 'violet', 'bone']);
    expect(DEFAULT_ACCENT).toBe('green');
    expect(ACCENT_PRESETS[0]!.hex).toBe('#63b356');
    expect(ACCENT_PRESETS.map((preset) => preset.id)).not.toContain('red');
  });

  it('keeps every preset readable as text and as a fill', () => {
    for (const preset of ACCENT_PRESETS) {
      expect(contrast(preset.hex, '#161616')).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#101010', preset.hex)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('normalizes stored values and falls back to green', () => {
    expect(normalizeAccent('amber')).toBe('amber');
    expect(normalizeAccent('  violet  ')).toBe('violet');
    expect(normalizeAccent('V IOLET')).toBe('green');
    expect(normalizeAccent('red')).toBe('green');
    expect(normalizeAccent(null)).toBe('green');
    expect(normalizeAccent(42)).toBe('green');
  });
});
