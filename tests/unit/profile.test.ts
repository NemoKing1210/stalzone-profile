import { describe, expect, it } from 'vitest';
import { durationHours, mapProfileStats } from '@dossier/core/services/profile';

describe('durationHours', () => {
  it('parses ISO-8601 durations', () => {
    expect(durationHours('PT100H')).toBe(100);
    expect(durationHours('PT2H30M')).toBe(2.5);
    expect(durationHours('PT45M')).toBe(0.75);
  });

  it('treats a number as seconds', () => {
    expect(durationHours(3600)).toBe(1);
    expect(durationHours(5400)).toBe(1.5);
  });

  it('returns null for unknown shapes', () => {
    expect(durationHours('soon')).toBeNull();
    expect(durationHours(null)).toBeNull();
  });
});

describe('mapProfileStats', () => {
  it('maps counters, converts playtime and keeps the date as text', () => {
    expect(
      mapProfileStats([
        { id: 'kil', type: 'INTEGER', value: 42 },
        { id: 'pla-tim', type: 'DURATION', value: 'PT10H' },
        { id: 'reg-tim', type: 'DATE', value: '2024-01-02' },
      ]),
    ).toEqual({ numeric: { kil: 42, 'pla-tim': 10 }, text: { 'reg-tim': '2024-01-02' } });
  });

  it('treats numeric playtime as seconds and ignores unknown or empty values', () => {
    expect(
      mapProfileStats([
        { id: 'pla-tim', type: 'DURATION', value: 7200 },
        { id: 'unknown', type: 'TEXT', value: 'x' },
        { id: 'dea', type: 'INTEGER', value: null },
        { id: 'reg-tim', type: 'DATE', value: '   ' },
      ]),
    ).toEqual({ numeric: { 'pla-tim': 2 }, text: {} });
  });
});
