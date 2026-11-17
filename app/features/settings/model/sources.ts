/** Display order mirrors core `SOURCE_IDS`, so a payload can be rendered without reordering. */
export const SOURCE_ORDER = ['exbo_base', 'wiki', 'scpmodel', 'motifs', 'icons', 'profile', 'local'] as const;

export type SourceId = (typeof SOURCE_ORDER)[number];

/** `local` is the owner's own data; it has no origin to fetch from. */
export const SYNCABLE_SOURCES = ['exbo_base', 'wiki', 'scpmodel', 'motifs', 'icons', 'profile'] as const;

/** Off plus the presets offered by the select; other stored values are added by the form. */
export const INTERVAL_VALUES = [0, 15, 30, 60, 180, 360, 720, 1440] as const;

export type NextRunBucket = { kind: 'off' } | { kind: 'due' } | { kind: 'in'; minutes: number };

export function nextRunBucket(nextRunAt: string | null, now: number): NextRunBucket {
  if (!nextRunAt) return { kind: 'off' };
  const at = Date.parse(nextRunAt);
  if (!Number.isFinite(at)) return { kind: 'off' };
  if (at <= now) return { kind: 'due' };
  return { kind: 'in', minutes: Math.max(1, Math.ceil((at - now) / 60_000)) };
}

/** Minutes since a timestamp, or null when the source has never been tried. */
export function minutesSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.floor((now - at) / 60_000));
}

export function canSyncSource(id: string, profileApiConfigured: boolean): boolean {
  if (id === 'local') return false;
  if (id === 'profile') return profileApiConfigured;
  return (SYNCABLE_SOURCES as readonly string[]).includes(id);
}

export function sourceKey(id: string, part: 'title' | 'description' | 'updates'): string {
  return `settings.sources.items.${id}.${part}`;
}
