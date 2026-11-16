import { DEFAULT_ACCENT, normalizeAccent, type AccentId } from '../utils/accents';

/**
 * Applies the stored accent before the app mounts. The inline head script already
 * set `data-accent` to avoid a flash; this keeps the shared state in sync with it.
 */
export default defineNuxtPlugin(() => {
  const accent = useState<AccentId>('accent', () => DEFAULT_ACCENT);

  try {
    const stored = localStorage.getItem('dossier.accent');
    if (stored !== null) accent.value = normalizeAccent(stored);
    document.documentElement.dataset.accent = accent.value;
  } catch {
    /* storage or DOM unavailable: the SSR default stays in place */
  }
});
