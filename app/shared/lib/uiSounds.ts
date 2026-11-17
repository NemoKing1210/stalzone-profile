/**
 * Pure model for the interface click sounds: persisted settings and the rule that
 * decides which elements get a sound. The audio itself lives in `useUiSounds`,
 * because it needs the browser's Web Audio API.
 */

export type UiSoundKind = 'tap' | 'toggle';

export interface SoundSettings {
  enabled: boolean;
  volume: number;
}

export interface SoundTarget {
  tagName: string;
  role?: string | null;
  type?: string | null;
  disabled?: boolean;
  ariaDisabled?: boolean;
  /** Set when the element sits inside `[data-no-ui-sounds]`. */
  muted?: boolean;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { enabled: true, volume: 0.6 };

export const SOUND_STORAGE_KEY = 'profile.sounds';

const TOGGLE_ROLES = new Set(['switch', 'checkbox', 'radio']);
const TAP_ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'menuitemradio', 'option']);
const TOGGLE_TYPES = new Set(['checkbox', 'radio']);
const TAP_TYPES = new Set(['button', 'submit', 'reset']);

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Reads the persisted settings, falling back on anything malformed. */
export function parseSoundSettings(raw: string | null): SoundSettings {
  if (!raw) return { ...DEFAULT_SOUND_SETTINGS };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...DEFAULT_SOUND_SETTINGS };
  }

  const record = parsed as Record<string, unknown>;
  const enabled = typeof record.enabled === 'boolean' ? record.enabled : DEFAULT_SOUND_SETTINGS.enabled;
  const volume =
    typeof record.volume === 'number' && Number.isFinite(record.volume)
      ? clampVolume(record.volume)
      : DEFAULT_SOUND_SETTINGS.volume;

  return { enabled, volume };
}

export function serializeSoundSettings(settings: SoundSettings): string {
  return JSON.stringify({ enabled: settings.enabled, volume: clampVolume(settings.volume) });
}

/**
 * `tap` for controls that activate once, `toggle` for switches and checkboxes,
 * `null` for text entry, sliders, disabled controls and plain content.
 */
export function classifySoundTarget(target: SoundTarget | null | undefined): UiSoundKind | null {
  if (!target || target.disabled || target.ariaDisabled || target.muted) return null;

  const role = target.role?.toLowerCase();
  if (role && TOGGLE_ROLES.has(role)) return 'toggle';
  if (role && TAP_ROLES.has(role)) return 'tap';

  const tag = target.tagName.toUpperCase();
  const type = target.type?.toLowerCase();

  if (tag === 'INPUT') {
    if (type && TOGGLE_TYPES.has(type)) return 'toggle';
    if (type && TAP_TYPES.has(type)) return 'tap';
    return null;
  }
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || tag === 'SELECT' || tag === 'LABEL') return 'tap';

  return null;
}

function isToggleTarget(target: SoundTarget): boolean {
  return classifySoundTarget(target) === 'toggle';
}

/** Whether a key press activates the focused control, so a keyboard click sounds too. */
export function isActivationKey(event: { key: string } & SoundTarget): boolean {
  const kind = classifySoundTarget(event);
  if (!kind) return false;

  if (event.key === 'Enter') return true;
  if (event.key !== ' ' && event.key !== 'Spacebar') return false;

  const tag = event.tagName.toUpperCase();
  if (tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'LABEL') return true;
  return isToggleTarget(event);
}
