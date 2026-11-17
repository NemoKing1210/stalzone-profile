import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VOLUME,
  durationFromMetadata,
  formatClock,
  nextTrackIndex,
  parseRadioState,
  prevTrackIndex,
  spectrumLevels,
} from '~/features/radio/model/player';

const IDS = ['the-world-fell-silent', 'outpost', 'dirty-rain'];

describe('parseRadioState', () => {
  const fallback = { trackId: IDS[0], volume: DEFAULT_VOLUME, expanded: false };

  it('returns the defaults for missing or invalid JSON', () => {
    expect(parseRadioState(null, IDS)).toEqual(fallback);
    expect(parseRadioState('', IDS)).toEqual(fallback);
    expect(parseRadioState('{', IDS)).toEqual(fallback);
    expect(parseRadioState('null', IDS)).toEqual(fallback);
  });

  it('reads a valid stored state', () => {
    expect(parseRadioState('{"trackId":"outpost","volume":0.4,"expanded":true}', IDS)).toEqual({
      trackId: 'outpost',
      volume: 0.4,
      expanded: true,
    });
  });

  it('falls back for an unknown track or missing fields', () => {
    expect(parseRadioState('{"trackId":"unknown","volume":0.4}', IDS).trackId).toBe(IDS[0]);
    expect(parseRadioState('{}', IDS)).toEqual(fallback);
  });

  it('keeps the player collapsed unless a boolean says otherwise', () => {
    expect(parseRadioState('{"expanded":true}', IDS).expanded).toBe(true);
    expect(parseRadioState('{"expanded":false}', IDS).expanded).toBe(false);
    expect(parseRadioState('{"expanded":"yes"}', IDS).expanded).toBe(false);
  });

  it('clamps a finite volume and rejects a non-finite one', () => {
    expect(parseRadioState('{"volume":2}', IDS).volume).toBe(1);
    expect(parseRadioState('{"volume":-0.2}', IDS).volume).toBe(0);
    expect(parseRadioState('{"volume":1e999}', IDS).volume).toBe(DEFAULT_VOLUME);
    expect(parseRadioState('{"volume":"loud"}', IDS).volume).toBe(DEFAULT_VOLUME);
  });
});

describe('track navigation', () => {
  it('wraps forward', () => {
    expect(nextTrackIndex(0, 3)).toBe(1);
    expect(nextTrackIndex(1, 3)).toBe(2);
    expect(nextTrackIndex(2, 3)).toBe(0);
  });

  it('wraps backward', () => {
    expect(prevTrackIndex(0, 3)).toBe(2);
    expect(prevTrackIndex(2, 3)).toBe(1);
  });

  it('normalizes an out-of-range current index', () => {
    expect(nextTrackIndex(-1, 3)).toBe(0);
    expect(nextTrackIndex(3, 3)).toBe(1);
    expect(prevTrackIndex(-1, 3)).toBe(1);
    expect(prevTrackIndex(3, 3)).toBe(2);
  });

  it('handles a single track and an empty list', () => {
    expect(nextTrackIndex(0, 1)).toBe(0);
    expect(prevTrackIndex(0, 1)).toBe(0);
    expect(nextTrackIndex(0, 0)).toBe(0);
    expect(prevTrackIndex(0, 0)).toBe(0);
  });
});

describe('formatClock', () => {
  it('formats seconds and minutes', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(61)).toBe('1:01');
    expect(formatClock(61.9)).toBe('1:01');
    expect(formatClock(3599)).toBe('59:59');
  });

  it('formats an hour or more', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3661)).toBe('1:01:01');
  });

  it('renders an unknown time as a dash', () => {
    expect(formatClock(Number.NaN)).toBe('--:--');
    expect(formatClock(Infinity)).toBe('--:--');
    expect(formatClock(-1)).toBe('--:--');
  });
});

describe('durationFromMetadata', () => {
  it('keeps a positive finite duration', () => {
    expect(durationFromMetadata(153.599)).toBe(153.599);
  });

  it('treats zero, negative and non-finite values as unknown', () => {
    expect(durationFromMetadata(0)).toBeNull();
    expect(durationFromMetadata(-1)).toBeNull();
    expect(durationFromMetadata(Number.NaN)).toBeNull();
    expect(durationFromMetadata(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('spectrumLevels', () => {
  it('returns the requested number of bars', () => {
    expect(spectrumLevels(new Uint8Array(32), 8)).toHaveLength(8);
  });

  it('maps silence to zeros and full scale to ones', () => {
    expect(spectrumLevels(new Uint8Array(32), 8)).toEqual(Array(8).fill(0));
    expect(spectrumLevels(new Uint8Array(32).fill(255), 8)).toEqual(Array(8).fill(1));
  });

  it('keeps every level inside 0..1', () => {
    const levels = spectrumLevels(new Uint8Array([0, 255, 0, 255, 128]), 3);
    for (const level of levels) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });

  it('returns an empty list for a non-positive bar count', () => {
    expect(spectrumLevels(new Uint8Array(8), 0)).toEqual([]);
  });
});
