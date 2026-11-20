import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DENSITY,
  DEFAULT_FONT,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DENSITIES,
  DENSITY_STORAGE_KEY,
  FONT_STORAGE_KEY,
  MAX_REPLACED_NOTIFICATIONS,
  MAX_STACKED_NOTIFICATIONS,
  NOTIFICATION_DURATIONS,
  NOTIFICATION_POSITIONS,
  NOTIFICATIONS_STORAGE_KEY,
  UI_FONTS,
  normalizeDensity,
  normalizeFont,
  normalizeNotificationDuration,
  normalizeNotificationPosition,
  normalizeNotificationPreferences,
  normalizeNotificationStack,
  notificationToasterProps,
  parseNotificationPreferences,
  persistDensity,
  persistFont,
  persistNotifications,
  readStoredDensity,
  readStoredFont,
  readStoredNotifications,
  serializeNotificationPreferences,
  type AppearanceStorage,
} from '../../app/shared/lib/appearance';

function memoryStorage(initial: Record<string, string> = {}): AppearanceStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('notification defaults', () => {
  it('ships a bottom-right stack that lasts five seconds', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({
      position: 'bottom-right',
      duration: 5000,
      stack: 'stack',
    });
    expect(NOTIFICATION_POSITIONS).toHaveLength(6);
    expect(NOTIFICATION_DURATIONS).toContain(5000);
  });

  it('falls back to the defaults for missing or malformed JSON', () => {
    expect(parseNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(parseNotificationPreferences('')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(parseNotificationPreferences('{')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(parseNotificationPreferences('null')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(parseNotificationPreferences('[]')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it('normalizes each field independently', () => {
    expect(parseNotificationPreferences('{"position":"top-left","duration":8000,"stack":"replace"}')).toEqual({
      position: 'top-left',
      duration: 8000,
      stack: 'replace',
    });
    expect(parseNotificationPreferences('{"position":"diagonal","duration":"slow","stack":"merge"}')).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES,
    );
    expect(normalizeNotificationPreferences({ position: ' TOP-RIGHT ', duration: 3000, stack: 'REPLACE' })).toEqual({
      position: 'top-right',
      duration: 3000,
      stack: 'replace',
    });
  });

  it('clamps the duration to one to sixty seconds', () => {
    expect(normalizeNotificationDuration(250)).toBe(1000);
    expect(normalizeNotificationDuration(90_000)).toBe(60_000);
    expect(normalizeNotificationDuration(5000.4)).toBe(5000);
    expect(normalizeNotificationDuration(Number.NaN)).toBe(5000);
    expect(normalizeNotificationDuration('8000')).toBe(5000);
  });

  it('accepts only the six positions and two stacking modes', () => {
    for (const position of NOTIFICATION_POSITIONS) {
      expect(normalizeNotificationPosition(position)).toBe(position);
    }
    expect(normalizeNotificationPosition('middle')).toBe('bottom-right');
    expect(normalizeNotificationPosition(null)).toBe('bottom-right');
    expect(normalizeNotificationStack('replace')).toBe('replace');
    expect(normalizeNotificationStack('stack')).toBe('stack');
    expect(normalizeNotificationStack('both')).toBe('stack');
  });

  it('round-trips through serialize', () => {
    const preferences = { position: 'top-center' as const, duration: 12_000, stack: 'replace' as const };
    expect(parseNotificationPreferences(serializeNotificationPreferences(preferences))).toEqual(preferences);
    expect(serializeNotificationPreferences({ ...preferences, duration: 0 })).toContain('"duration":1000');
  });

  it('derives the toaster props, with one slot in replace mode', () => {
    expect(notificationToasterProps(DEFAULT_NOTIFICATION_PREFERENCES)).toEqual({
      position: 'bottom-right',
      duration: 5000,
      max: MAX_STACKED_NOTIFICATIONS,
    });
    expect(notificationToasterProps({ position: 'top-left', duration: 3000, stack: 'replace' })).toEqual({
      position: 'top-left',
      duration: 3000,
      max: MAX_REPLACED_NOTIFICATIONS,
    });
  });
});

describe('font and density preferences', () => {
  it('ships the condensed font and comfortable density as defaults', () => {
    expect(UI_FONTS).toEqual(['condensed', 'oswald']);
    expect(DENSITIES).toEqual(['comfortable', 'compact']);
    expect(DEFAULT_FONT).toBe('condensed');
    expect(DEFAULT_DENSITY).toBe('comfortable');
  });

  it('normalizes stored values and falls back on anything else', () => {
    expect(normalizeFont(' OSWALD ')).toBe('oswald');
    expect(normalizeFont('condensed')).toBe('condensed');
    expect(normalizeFont('bebas')).toBe('condensed');
    expect(normalizeFont(null)).toBe('condensed');
    expect(normalizeDensity('compact')).toBe('compact');
    expect(normalizeDensity(' COMFORTABLE ')).toBe('comfortable');
    expect(normalizeDensity('tiny')).toBe('comfortable');
    expect(normalizeDensity(1)).toBe('comfortable');
  });
});

describe('appearance storage', () => {
  it('reads each setting from its own cosmetic key', () => {
    const storage = memoryStorage({
      [NOTIFICATIONS_STORAGE_KEY]: '{"position":"top-right","duration":8000,"stack":"replace"}',
      [FONT_STORAGE_KEY]: 'oswald',
      [DENSITY_STORAGE_KEY]: 'compact',
    });
    expect(readStoredNotifications(storage)).toEqual({ position: 'top-right', duration: 8000, stack: 'replace' });
    expect(readStoredFont(storage)).toBe('oswald');
    expect(readStoredDensity(storage)).toBe('compact');
    expect(readStoredNotifications(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(readStoredFont(null)).toBe(DEFAULT_FONT);
    expect(readStoredDensity(null)).toBe(DEFAULT_DENSITY);
  });

  it('persists normalized values and reports a blocked storage', () => {
    const storage = memoryStorage();
    expect(persistNotifications(storage, { position: 'top-left', duration: 1000, stack: 'replace' })).toBe(true);
    expect(JSON.parse(storage.data.get(NOTIFICATIONS_STORAGE_KEY)!)).toEqual({
      position: 'top-left',
      duration: 1000,
      stack: 'replace',
    });
    expect(persistFont(storage, 'oswald')).toBe(true);
    expect(storage.data.get(FONT_STORAGE_KEY)).toBe('oswald');
    expect(persistDensity(storage, 'compact')).toBe(true);
    expect(storage.data.get(DENSITY_STORAGE_KEY)).toBe('compact');

    const blocked: AppearanceStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readStoredNotifications(blocked)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(readStoredFont(blocked)).toBe(DEFAULT_FONT);
    expect(readStoredDensity(blocked)).toBe(DEFAULT_DENSITY);
    expect(persistNotifications(blocked, DEFAULT_NOTIFICATION_PREFERENCES)).toBe(false);
    expect(persistFont(blocked, 'oswald')).toBe(false);
    expect(persistDensity(blocked, 'compact')).toBe(false);
  });
});
