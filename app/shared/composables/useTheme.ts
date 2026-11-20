import {
  DEFAULT_THEME,
  THEMES,
  normalizeTheme,
  persistTheme,
  readStoredTheme,
  type ThemeId,
} from '../lib/theme';

/**
 * The theme shared by the page and the persisted choice. The server always renders the
 * dark tokens; the inline head script in `nuxt.config.ts` reads the same cosmetic key and
 * sets `data-theme` before the first paint, so a light choice never flashes dark.
 *
 * State starts on the server default and is synced in `onMounted`, which keeps the first
 * client render identical to the SSR markup (no hydration mismatch). The visible theme is
 * already correct before that because it comes from the `data-theme` attribute.
 */
export function useTheme() {
  const theme = useState<ThemeId>('theme', () => DEFAULT_THEME);

  function apply(id: ThemeId): void {
    theme.value = id;
    if (!import.meta.client) return;
    try {
      const root = document.documentElement;
      root.dataset.theme = id;
      root.style.colorScheme = id;
    } catch {
      /* no document in non-browser environments */
    }
  }

  function setTheme(value: unknown): void {
    const next = normalizeTheme(value);
    apply(next);
    if (!import.meta.client) return;
    try {
      persistTheme(window.localStorage, next);
    } catch {
      /* storage can be blocked in private mode; the choice still applies for this page */
    }
  }

  function toggleTheme(): void {
    setTheme(theme.value === 'dark' ? 'light' : 'dark');
  }

  onMounted(() => {
    let stored: ThemeId = DEFAULT_THEME;
    try {
      stored = readStoredTheme(window.localStorage);
    } catch {
      /* storage unavailable: the attribute set by the head script, or the default, stays */
    }
    if (stored !== theme.value) apply(stored);
  });

  return { theme, themes: THEMES, setTheme, toggleTheme };
}
