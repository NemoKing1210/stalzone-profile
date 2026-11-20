/**
 * Pure model for the dark/light theme: the values of both token sets, the normalizer and
 * the small storage helpers. The stylesheet is the renderer; this module is the map that
 * tests hold against it, so a token can never quietly exist in only one theme.
 *
 * `--sz-preset-*` is the raw accent palette and is deliberately absent: those values do
 * not change with the theme, only the semantic accent tokens they feed do.
 */

import type { AccentId } from './accents';

export type ThemeId = 'dark' | 'light';

export const DEFAULT_THEME: ThemeId = 'dark';
export const THEMES: readonly ThemeId[] = ['dark', 'light'];

/** One cosmetic key: no personal data, safe to read before hydration. */
export const THEME_STORAGE_KEY = 'profile.theme';

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The semantic `--sz-*` tokens that must exist in every theme. */
export const THEME_TOKENS: Readonly<Record<ThemeId, Readonly<Record<string, string>>>> = {
  dark: {
    '--sz-accent': '#63b356',
    '--sz-accent-hover': '#74c466',
    '--sz-accent-pressed': '#4f9945',
    '--sz-on-accent': '#101010',
    '--sz-bg': '#161616',
    '--sz-surface': '#1f1f1f',
    '--sz-surface-alt': '#1b1b1b',
    '--sz-surface-header': '#262626',
    '--sz-border': '#343434',
    '--sz-border-strong': '#454545',
    '--sz-field': '#74746e',
    '--sz-text': '#d8d8d3',
    '--sz-text-muted': '#9a9a94',
    '--sz-text-dim': '#8f8f89',
    '--sz-text-toned': '#b4b4ae',
    '--sz-text-highlighted': '#f1f1ec',
    '--sz-shadow-image-text': '0 1px 2px rgba(0, 0, 0, 0.65)',
    '--sz-atmosphere-vignette': 'rgba(0, 0, 0, 0.34)',
    '--sz-success': '#63b356',
    '--sz-success-text': '#86cf7f',
    '--sz-warning': '#e0a63c',
    '--sz-warning-text': '#f0c469',
    '--sz-danger': '#c2564f',
    '--sz-danger-text': '#e08b84',
    '--sz-info': '#4a9fd8',
    '--sz-money': '#d8c08a',
    '--sz-rank-default': '#8a9384',
    '--sz-rank-newbie': '#63b356',
    '--sz-rank-stalker': '#4a9fd8',
    '--sz-rank-veteran': '#b78bd6',
    '--sz-rank-master': '#d9736b',
    '--sz-rank-legend': '#e0a63c',
  },
  light: {
    '--sz-accent': '#2a7023',
    '--sz-accent-hover': '#286b21',
    '--sz-accent-pressed': '#235f1d',
    '--sz-on-accent': '#faf9f5',
    '--sz-bg': '#f2f0ea',
    '--sz-surface': '#faf9f5',
    '--sz-surface-alt': '#eae7df',
    '--sz-surface-header': '#e3ded3',
    '--sz-border': '#d3cec2',
    '--sz-border-strong': '#b6b0a2',
    '--sz-field': '#6f6a60',
    '--sz-text': '#1d1d1a',
    '--sz-text-muted': '#57554d',
    '--sz-text-dim': '#625f57',
    '--sz-text-toned': '#49473f',
    '--sz-text-highlighted': '#121210',
    '--sz-shadow-image-text': '0 1px 2px rgba(0, 0, 0, 0.55)',
    '--sz-atmosphere-vignette': 'rgba(80, 66, 40, 0.16)',
    '--sz-success': '#3f7f36',
    '--sz-success-text': '#2f6b28',
    '--sz-warning': '#9c6916',
    '--sz-warning-text': '#7a530c',
    '--sz-danger': '#a23a33',
    '--sz-danger-text': '#8d2f29',
    '--sz-info': '#1f5f8f',
    '--sz-money': '#6d571c',
    '--sz-rank-default': '#5b6157',
    '--sz-rank-newbie': '#2f6b28',
    '--sz-rank-stalker': '#1f5f8f',
    '--sz-rank-veteran': '#654079',
    '--sz-rank-master': '#8d2f29',
    '--sz-rank-legend': '#7a530c',
  },
};

export interface AccentTokens {
  accent: string;
  hover: string;
  pressed: string;
}

/**
 * Only the light theme needs its own accent values: the dark presets are tuned for text
 * on dark surfaces, while the same hue must darken to clear 4.5:1 on paper. Green is the
 * default and lives in `THEME_TOKENS.light`; the other four mirror their CSS blocks.
 */
export const LIGHT_ACCENT_TOKENS: Readonly<Record<AccentId, AccentTokens>> = {
  green: { accent: '#2a7023', hover: '#286b21', pressed: '#235f1d' },
  amber: { accent: '#7d550d', hover: '#714c0b', pressed: '#654308' },
  blue: { accent: '#1f5f8f', hover: '#1a527c', pressed: '#16466a' },
  violet: { accent: '#654079', hover: '#58376a', pressed: '#4c2f5c' },
  bone: { accent: '#5e5e59', hover: '#51514c', pressed: '#454541' },
};

/** Anything that is not exactly `light` falls back to the server-rendered default. */
export function normalizeTheme(value: unknown): ThemeId {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return id === 'light' ? 'light' : DEFAULT_THEME;
}

/** Reads one cosmetic key; a missing, malformed or blocked storage yields the default. */
export function readStoredTheme(storage: ThemeStorage | null | undefined): ThemeId {
  if (!storage) return DEFAULT_THEME;
  try {
    return normalizeTheme(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/** Returns whether the choice was stored; the theme still applies when it was not. */
export function persistTheme(storage: ThemeStorage | null | undefined, theme: ThemeId): boolean {
  if (!storage) return false;
  try {
    storage.setItem(THEME_STORAGE_KEY, normalizeTheme(theme));
    return true;
  } catch {
    return false;
  }
}
