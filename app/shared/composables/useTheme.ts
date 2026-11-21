import {
  DEFAULT_THEME,
  THEMES,
  normalizeTheme,
  persistTheme,
  readStoredTheme,
  type ThemeId,
} from '../lib/theme';
import { runViewTransition } from '../lib/motion';

/** One view transition at a time: a rapid second toggle applies instantly instead of queueing. */
let themeTransitioning = false;

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
    if (!import.meta.client) {
      apply(next);
      return;
    }
    if (!themeTransitioning) {
      const started = runViewTransition(() => apply(next), {
        document: document as unknown as { startViewTransition?: (callback: () => void) => unknown },
        matchMedia: (query) => window.matchMedia(query),
      });
      if (started) {
        themeTransitioning = true;
        window.setTimeout(() => {
          themeTransitioning = false;
        }, 220);
      }
    } else {
      apply(next);
    }
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
