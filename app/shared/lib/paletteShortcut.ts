/**
 * The command palette's browser-local shortcut. `Ctrl+Space` switches input methods on some
 * systems, so `Ctrl/Cmd+K` is always available as the second binding; this choice only says
 * which of them the shell listens to.
 */
export type PaletteShortcut = 'both' | 'ctrl-space' | 'ctrl-k';

export const PALETTE_SHORTCUTS: readonly PaletteShortcut[] = ['both', 'ctrl-space', 'ctrl-k'];
export const PALETTE_SHORTCUT_KEY = 'profile.palette-shortcut';

export function normalizePaletteShortcut(value: unknown): PaletteShortcut {
  return PALETTE_SHORTCUTS.includes(value as PaletteShortcut) ? (value as PaletteShortcut) : 'both';
}

export function readPaletteShortcut(storage: Storage | null): PaletteShortcut {
  try {
    return normalizePaletteShortcut(storage?.getItem(PALETTE_SHORTCUT_KEY));
  } catch {
    return 'both';
  }
}

export function persistPaletteShortcut(storage: Storage | null, value: PaletteShortcut): void {
  try {
    storage?.setItem(PALETTE_SHORTCUT_KEY, value);
  } catch {
    /* private mode: the choice still applies for this page */
  }
}

/** Whether a shortcut setting listens to `space` (Ctrl+Space) or `k` (Ctrl/Cmd+K). */
export function paletteShortcutEnabled(setting: PaletteShortcut, key: 'space' | 'k'): boolean {
  if (setting === 'both') return true;
  return setting === 'ctrl-space' ? key === 'space' : key === 'k';
}

/** A focused text control keeps its own keyboard; the palette must not steal the shortcut. */
export function isTextField(target: EventTarget | null): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable === true;
}

/** The palette marks the body while open, so the grid's Escape handler yields to it. */
export const PALETTE_OPEN_ATTRIBUTE = 'paletteOpen';

interface DocumentScope {
  document?: { body?: { dataset?: Record<string, string> } };
}

export function isPaletteOpen(): boolean {
  // This module also typechecks in the DOM-less Node project; the runtime check stays.
  const scope = globalThis as unknown as DocumentScope;
  return scope.document?.body?.dataset?.[PALETTE_OPEN_ATTRIBUTE] === '1';
}
