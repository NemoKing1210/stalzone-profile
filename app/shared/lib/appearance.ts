/**
 * Pure model for the presentation choices that are not the theme: notification placement
 * and timing, the interface font and the density. Everything here is cosmetic and lives
 * in localStorage; the server renders the defaults and the client applies a stored choice
 * after hydration, so no option can cause a hydration mismatch.
 */

export const NOTIFICATION_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;

export type NotificationPosition = (typeof NOTIFICATION_POSITIONS)[number];

export type NotificationStack = 'stack' | 'replace';

export interface NotificationPreferences {
  position: NotificationPosition;
  /** Milliseconds a notification stays on screen. */
  duration: number;
  stack: NotificationStack;
}

export const NOTIFICATION_DURATIONS = [3000, 5000, 8000, 12000] as const;
export const DEFAULT_NOTIFICATION_PREFERENCES: Readonly<NotificationPreferences> = {
  position: 'bottom-right',
  duration: 5000,
  stack: 'stack',
};
export const NOTIFICATIONS_STORAGE_KEY = 'profile.notifications';

/** How many notifications the shell keeps at once for each stacking mode. */
export const MAX_STACKED_NOTIFICATIONS = 5;
export const MAX_REPLACED_NOTIFICATIONS = 1;

export const UI_FONTS = ['condensed', 'oswald'] as const;
export type UiFontId = (typeof UI_FONTS)[number];
export const DEFAULT_FONT: UiFontId = 'condensed';
export const FONT_STORAGE_KEY = 'profile.font';

export const DENSITIES = ['comfortable', 'compact'] as const;
export type DensityId = (typeof DENSITIES)[number];
export const DEFAULT_DENSITY: DensityId = 'comfortable';
export const DENSITY_STORAGE_KEY = 'profile.density';

export interface AppearanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function normalizeNotificationPosition(value: unknown): NotificationPosition {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (NOTIFICATION_POSITIONS as readonly string[]).includes(id)
    ? (id as NotificationPosition)
    : DEFAULT_NOTIFICATION_PREFERENCES.position;
}

/** A stored duration is clamped to 1–60 seconds; anything not a finite number is the default. */
export function normalizeNotificationDuration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_NOTIFICATION_PREFERENCES.duration;
  }
  return Math.min(60_000, Math.max(1_000, Math.round(value)));
}

export function normalizeNotificationStack(value: unknown): NotificationStack {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return id === 'replace' ? 'replace' : 'stack';
}

export function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  const record =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    position: normalizeNotificationPosition(record.position),
    duration: normalizeNotificationDuration(record.duration),
    stack: normalizeNotificationStack(record.stack),
  };
}

/** Reads the JSON blob, falling back to the defaults for anything malformed. */
export function parseNotificationPreferences(raw: string | null): NotificationPreferences {
  if (!raw) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  return normalizeNotificationPreferences(parsed);
}

export function serializeNotificationPreferences(preferences: NotificationPreferences): string {
  const normalized = normalizeNotificationPreferences(preferences);
  return JSON.stringify(normalized);
}

/** Applies the position, duration and stacking mode to Nuxt UI's `UApp` toaster props. */
export function notificationToasterProps(preferences: NotificationPreferences): {
  position: NotificationPosition;
  duration: number;
  max: number;
} {
  const normalized = normalizeNotificationPreferences(preferences);
  return {
    position: normalized.position,
    duration: normalized.duration,
    max: normalized.stack === 'replace' ? MAX_REPLACED_NOTIFICATIONS : MAX_STACKED_NOTIFICATIONS,
  };
}

export function normalizeFont(value: unknown): UiFontId {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (UI_FONTS as readonly string[]).includes(id) ? (id as UiFontId) : DEFAULT_FONT;
}

export function normalizeDensity(value: unknown): DensityId {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (DENSITIES as readonly string[]).includes(id) ? (id as DensityId) : DEFAULT_DENSITY;
}

export function readStoredNotifications(storage: AppearanceStorage | null | undefined): NotificationPreferences {
  if (!storage) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  try {
    return parseNotificationPreferences(storage.getItem(NOTIFICATIONS_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

export function readStoredFont(storage: AppearanceStorage | null | undefined): UiFontId {
  if (!storage) return DEFAULT_FONT;
  try {
    return normalizeFont(storage.getItem(FONT_STORAGE_KEY));
  } catch {
    return DEFAULT_FONT;
  }
}

export function readStoredDensity(storage: AppearanceStorage | null | undefined): DensityId {
  if (!storage) return DEFAULT_DENSITY;
  try {
    return normalizeDensity(storage.getItem(DENSITY_STORAGE_KEY));
  } catch {
    return DEFAULT_DENSITY;
  }
}

export function persistNotifications(
  storage: AppearanceStorage | null | undefined,
  preferences: NotificationPreferences,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(NOTIFICATIONS_STORAGE_KEY, serializeNotificationPreferences(preferences));
    return true;
  } catch {
    return false;
  }
}

export function persistFont(storage: AppearanceStorage | null | undefined, font: UiFontId): boolean {
  if (!storage) return false;
  try {
    storage.setItem(FONT_STORAGE_KEY, normalizeFont(font));
    return true;
  } catch {
    return false;
  }
}

export function persistDensity(storage: AppearanceStorage | null | undefined, density: DensityId): boolean {
  if (!storage) return false;
  try {
    storage.setItem(DENSITY_STORAGE_KEY, normalizeDensity(density));
    return true;
  } catch {
    return false;
  }
}
