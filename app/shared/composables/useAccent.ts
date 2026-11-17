import { ACCENT_PRESETS, DEFAULT_ACCENT, normalizeAccent, type AccentId } from '../lib/accents';

const STORAGE_KEY = 'dossier.accent';

/**
 * Reads the stored accent and returns the normalized id. Only runs in the browser:
 * during SSR there is no storage, and the server always renders the default.
 */
function readStored(): AccentId | null {
  if (!import.meta.client) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : normalizeAccent(raw);
  } catch {
    return null;
  }
}

export function useAccent() {
  const accent = useState<AccentId>('accent', () => DEFAULT_ACCENT);

  function apply(id: AccentId): void {
    accent.value = id;
    if (!import.meta.client) return;
    try {
      document.documentElement.dataset.accent = id;
    } catch {
      /* no document in non-browser environments */
    }
  }

  function setAccent(id: AccentId): void {
    apply(id);
    if (!import.meta.client) return;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* storage can be blocked in private mode; the choice still applies for this page */
    }
  }

  function resetAccent(): void {
    setAccent(DEFAULT_ACCENT);
  }

  onMounted(() => {
    const stored = readStored();
    if (stored && stored !== accent.value) setAccent(stored);
  });

  return { accent, presets: ACCENT_PRESETS, setAccent, resetAccent };
}
