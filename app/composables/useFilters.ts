/** Persists table sort/filter state per section in the browser. */
export function useFilters<T extends Record<string, string | number | boolean | null>>(key: string, defaults: T) {
  const storageKey = `dossier:filters:${key}`;
  const state = reactive({ ...defaults }) as T;

  onMounted(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const stored = JSON.parse(raw) as Record<string, unknown>;
      for (const field of Object.keys(defaults)) {
        if (field in stored) (state as Record<string, unknown>)[field] = stored[field];
      }
    } catch {
      /* private mode or corrupted value: keep defaults */
    }
  });

  watch(
    state,
    (value) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        /* storage unavailable: filters simply do not persist */
      }
    },
    { deep: true },
  );

  return state;
}
