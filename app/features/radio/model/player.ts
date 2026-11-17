export interface RadioState {
  trackId: string;
  volume: number;
  expanded: boolean;
}

export const DEFAULT_VOLUME = 0.7;

function defaults(trackIds: readonly string[]): RadioState {
  return { trackId: trackIds[0] ?? '', volume: DEFAULT_VOLUME, expanded: false };
}

/** Reads the persisted track/volume, falling back on anything malformed. */
export function parseRadioState(raw: string | null, trackIds: readonly string[]): RadioState {
  const fallback = defaults(trackIds);
  if (!raw) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;

  const record = parsed as Record<string, unknown>;
  const trackId =
    typeof record.trackId === 'string' && trackIds.includes(record.trackId)
      ? record.trackId
      : fallback.trackId;
  const volume =
    typeof record.volume === 'number' && Number.isFinite(record.volume)
      ? Math.min(1, Math.max(0, record.volume))
      : fallback.volume;
  const expanded = typeof record.expanded === 'boolean' ? record.expanded : fallback.expanded;

  return { trackId, volume, expanded };
}

export function nextTrackIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  const index = ((current % length) + length) % length;
  return (index + 1) % length;
}

export function prevTrackIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  const index = ((current % length) + length) % length;
  return (index - 1 + length) % length;
}

/** A media duration is only real when it is finite and positive; zero means unknown. */
export function durationFromMetadata(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** `m:ss` below an hour, `h:mm:ss` above it, and `--:--` when the value is unknown. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;

  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(rest)}` : `${minutes}:${pad2(rest)}`;
}

/** Maps analyser bins into `count` bars, each normalised to 0..1. */
export function spectrumLevels(data: ArrayLike<number>, count: number): number[] {
  if (count <= 0) return [];

  const levels = new Array<number>(count).fill(0);
  if (data.length === 0) return levels;

  for (let bar = 0; bar < count; bar += 1) {
    const start = Math.floor((bar * data.length) / count);
    const end = bar === count - 1 ? data.length : Math.floor(((bar + 1) * data.length) / count);
    let sum = 0;
    let bins = 0;

    for (let i = start; i < end; i += 1) {
      sum += Number(data[i]) || 0;
      bins += 1;
    }

    levels[bar] = bins === 0 ? 0 : Math.min(1, Math.max(0, sum / bins / 255));
  }

  return levels;
}
