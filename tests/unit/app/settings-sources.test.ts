import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INTERVAL_VALUES,
  SOURCE_ORDER,
  SYNCABLE_SOURCES,
  canSyncSource,
  minutesSince,
  nextRunBucket,
  recordMetricKey,
  sortSources,
  sourceFreshness,
  sourceJumpPath,
  sourceKey,
} from '~/features/settings/model/sources';

const NOW = Date.parse('2026-11-17T12:00:00.000Z');

describe('settings sources model', () => {
  it('lists every source once and keeps local out of sync actions', () => {
    expect(SOURCE_ORDER).toEqual(['exbo_base', 'wiki', 'scpmodel', 'motifs', 'icons', 'profile', 'local']);
    expect(SYNCABLE_SOURCES).toEqual(['exbo_base', 'wiki', 'scpmodel', 'motifs', 'icons', 'profile']);
  });

  it('offers off plus the 15..1440 minute presets', () => {
    expect(INTERVAL_VALUES).toEqual([0, 15, 30, 60, 180, 360, 720, 1440]);
    expect(INTERVAL_VALUES.every((value) => value === 0 || value >= 15)).toBe(true);
  });

  it('buckets next runs without inventing values', () => {
    expect(nextRunBucket(null, NOW)).toEqual({ kind: 'off' });
    expect(nextRunBucket('2026-11-17T11:59:00.000Z', NOW)).toEqual({ kind: 'due' });
    expect(nextRunBucket('2026-11-17T12:05:00.000Z', NOW)).toEqual({ kind: 'in', minutes: 5 });
    expect(nextRunBucket('2026-11-17T12:00:20.000Z', NOW)).toEqual({ kind: 'in', minutes: 1 });
  });

  it('returns null for a missing timestamp', () => {
    expect(minutesSince(null, NOW)).toBeNull();
    expect(minutesSince('2026-11-17T11:50:00.000Z', NOW)).toBe(10);
  });

  it('buckets source freshness from last success', () => {
    expect(sourceFreshness(null, NOW)).toBe('never');
    expect(sourceFreshness('2026-11-17T11:00:00.000Z', NOW)).toBe('fresh');
    expect(sourceFreshness('2026-11-17T08:00:00.000Z', NOW)).toBe('ageing');
    expect(sourceFreshness('2026-11-15T12:00:00.000Z', NOW)).toBe('stale');
    expect(sourceFreshness('2026-11-17T11:00:00.000Z', null)).toBe('never');
  });

  it('sorts cards by freshness and name without dropping any', () => {
    const sources = [
      { id: 'b', lastOkAt: null },
      { id: 'a', lastOkAt: '2026-11-15T12:00:00.000Z' },
      { id: 'c', lastOkAt: '2026-11-17T11:00:00.000Z' },
    ];
    expect(sortSources(sources, 'default', NOW).map((source) => source.id)).toEqual(['b', 'a', 'c']);
    expect(sortSources(sources, 'freshness', NOW).map((source) => source.id)).toEqual(['c', 'a', 'b']);
    expect(sortSources(sources, 'name', NOW).map((source) => source.id)).toEqual(['a', 'b', 'c']);
  });

  it('names the record metric and links to the data it feeds', () => {
    expect(recordMetricKey('price_quotes')).toBe('settings.sources.metrics.price_quotes');
    expect(recordMetricKey(null)).toBeNull();
    expect(sourceJumpPath('profile')).toBe('/');
    expect(sourceJumpPath('local')).toBe('/inventory');
    expect(sourceJumpPath('scpmodel')).toBe('/weapons');
  });

  it('disables the profile action without credentials and the local source always', () => {
    expect(canSyncSource('profile', false)).toBe(false);
    expect(canSyncSource('profile', true)).toBe(true);
    expect(canSyncSource('exbo_base', false)).toBe(true);
    expect(canSyncSource('local', true)).toBe(false);
  });

  it('builds stable translation keys and both catalogs contain them', () => {
    expect(sourceKey('exbo_base', 'title')).toBe('settings.sources.items.exbo_base.title');
    for (const locale of ['en', 'ru']) {
      const catalog = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'i18n', 'locales', `${locale}.json`), 'utf8'),
      ) as Record<string, any>;
      for (const id of SOURCE_ORDER) {
        for (const part of ['title', 'description', 'updates']) {
          expect(catalog.settings?.sources?.items?.[id]?.[part], `${locale} ${id}.${part}`).toBeTruthy();
        }
      }
    }
  });
});
