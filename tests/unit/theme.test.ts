import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS } from '../../app/shared/lib/accents';
import {
  DEFAULT_THEME,
  LIGHT_ACCENT_TOKENS,
  THEMES,
  THEME_STORAGE_KEY,
  THEME_TOKENS,
  normalizeTheme,
  persistTheme,
  readStoredTheme,
  type ThemeStorage,
} from '../../app/shared/lib/theme';
import { contrast } from './helpers/contrast';

function memoryStorage(initial: Record<string, string> = {}): ThemeStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function readBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `missing block ${selector}`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

/** Every `--sz-*: value;` declaration in a flat CSS block. */
function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/(--sz-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[match[1]!] = match[2]!.trim();
  }
  return out;
}

const CSS = fs.readFileSync(path.join(process.cwd(), 'app/assets/css/main.css'), 'utf8');
const ROOT_SEMANTIC = Object.fromEntries(
  Object.entries(tokens(readBlock(CSS, ':root {'))).filter(([name]) => !name.startsWith('--sz-preset-')),
);
const LIGHT_SEMANTIC = Object.fromEntries(
  Object.entries(tokens(readBlock(CSS, ":root[data-theme='light'] {"))).filter(
    ([name]) => !name.startsWith('--sz-preset-'),
  ),
);

describe('theme normalization and persistence', () => {
  it('accepts exactly the two themes and falls back to dark', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme(' LIGHT ')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('system')).toBe('dark');
    expect(normalizeTheme('')).toBe('dark');
    expect(normalizeTheme(null)).toBe('dark');
    expect(normalizeTheme(42)).toBe('dark');
    expect(DEFAULT_THEME).toBe('dark');
    expect(THEMES).toEqual(['dark', 'light']);
  });

  it('reads the stored theme from one cosmetic key', () => {
    expect(readStoredTheme(memoryStorage())).toBe('dark');
    expect(readStoredTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'light' }))).toBe('light');
    expect(readStoredTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'аметист' }))).toBe('dark');
    expect(readStoredTheme(null)).toBe('dark');
  });

  it('persists the normalized theme and reports a blocked storage', () => {
    const storage = memoryStorage();
    expect(persistTheme(storage, 'light')).toBe(true);
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe('light');

    const blocked: ThemeStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readStoredTheme(blocked)).toBe('dark');
    expect(persistTheme(blocked, 'light')).toBe(false);
    expect(persistTheme(null, 'light')).toBe(false);
  });
});

describe('theme token map', () => {
  it('matches the dark :root block, ignoring the raw preset palette', () => {
    expect(THEME_TOKENS.dark).toEqual(ROOT_SEMANTIC);
  });

  it('matches the light block and covers every semantic token', () => {
    expect(THEME_TOKENS.light).toEqual(LIGHT_SEMANTIC);
    expect(Object.keys(THEME_TOKENS.light).sort()).toEqual(Object.keys(THEME_TOKENS.dark).sort());
  });

  it('matches every light accent override block', () => {
    for (const preset of ACCENT_PRESETS) {
      const expected = LIGHT_ACCENT_TOKENS[preset.id];
      if (preset.id === 'green') {
        expect(THEME_TOKENS.light['--sz-accent']).toBe(expected.accent);
        expect(THEME_TOKENS.light['--sz-accent-hover']).toBe(expected.hover);
        expect(THEME_TOKENS.light['--sz-accent-pressed']).toBe(expected.pressed);
        continue;
      }

      const block = tokens(
        readBlock(CSS, `:root[data-theme='light'][data-accent='${preset.id}'] {`),
      );
      expect(block).toEqual({
        '--sz-accent': expected.accent,
        '--sz-accent-hover': expected.hover,
        '--sz-accent-pressed': expected.pressed,
      });
    }
  });
});

describe('theme contrast', () => {
  const surfaces = ['--sz-bg', '--sz-surface', '--sz-surface-alt', '--sz-surface-header'] as const;
  const textTokens = [
    '--sz-text',
    '--sz-text-muted',
    '--sz-text-dim',
    '--sz-text-toned',
    '--sz-text-highlighted',
    '--sz-success-text',
    '--sz-warning-text',
    '--sz-danger-text',
    '--sz-info',
    '--sz-money',
    '--sz-rank-default',
    '--sz-rank-newbie',
    '--sz-rank-stalker',
    '--sz-rank-veteran',
    '--sz-rank-master',
    '--sz-rank-legend',
  ] as const;
  const fillTokens = ['--sz-success', '--sz-warning', '--sz-danger', '--sz-info'] as const;

  it('keeps every text token at 4.5:1 on every surface in both themes', () => {
    for (const theme of THEMES) {
      for (const token of textTokens) {
        for (const surface of surfaces) {
          expect(
            contrast(THEME_TOKENS[theme][token]!, THEME_TOKENS[theme][surface]!),
            `${theme} ${token} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('keeps UI fills and field edges at 3:1 on every surface', () => {
    for (const theme of THEMES) {
      for (const token of [...fillTokens, '--sz-field'] as const) {
        for (const surface of surfaces) {
          expect(
            contrast(THEME_TOKENS[theme][token]!, THEME_TOKENS[theme][surface]!),
            `${theme} ${token} on ${surface}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('keeps accent text and accent fills readable in both themes', () => {
    for (const theme of THEMES) {
      const tokens_ = THEME_TOKENS[theme];
      for (const surface of surfaces) {
        expect(
          contrast(tokens_['--sz-accent']!, tokens_[surface]!),
          `${theme} accent on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(tokens_['--sz-on-accent']!, tokens_['--sz-accent']!)).toBeGreaterThanOrEqual(4.5);
    }

    for (const preset of ACCENT_PRESETS) {
      const expected = LIGHT_ACCENT_TOKENS[preset.id];
      for (const value of [expected.accent, expected.hover, expected.pressed]) {
        for (const surface of surfaces) {
          expect(contrast(value, THEME_TOKENS.light[surface]!)).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrast(THEME_TOKENS.light['--sz-on-accent']!, value)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the image label shadow and vignette tokens identical in shape', () => {
    for (const theme of THEMES) {
      expect(THEME_TOKENS[theme]['--sz-shadow-image-text']).toMatch(/^0 1px 2px rgba\(/);
      expect(THEME_TOKENS[theme]['--sz-atmosphere-vignette']).toMatch(/^rgba\(/);
    }
  });
});
