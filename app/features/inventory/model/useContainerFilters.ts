import {
  containerFilterActive,
  DEFAULT_CONTAINER_FILTER,
  type ContainerFilter,
} from './containerFilters';

const STORAGE_KEY = 'profile:container-filters';

function isFilter(value: unknown): value is ContainerFilter {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.kind === 'string' && typeof entry.rank === 'string' && typeof entry.quality === 'string';
}

/**
 * One persisted filter per storage. Filtering is a view: placements never leave the
 * database, and while a filter hides items the grid packs the visible ones from the
 * top-left in the layout order; clearing it shows the stored cells again.
 */
export function useContainerFilters() {
  const state = reactive<Record<string, ContainerFilter>>({});

  function filterFor(storageId: number): ContainerFilter {
    const key = String(storageId);
    state[key] ??= { ...DEFAULT_CONTAINER_FILTER };
    return state[key]!;
  }

  function isActive(storageId: number): boolean {
    const filter = state[String(storageId)];
    return filter ? containerFilterActive(filter) : false;
  }

  function activeStorages(): Set<number> {
    return new Set(
      Object.entries(state)
        .filter(([, filter]) => containerFilterActive(filter))
        .map(([id]) => Number(id)),
    );
  }

  onMounted(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as Record<string, unknown>;
      for (const [id, value] of Object.entries(stored)) if (isFilter(value)) state[id] = value;
    } catch {
      /* private mode or corrupted value: every container starts unfiltered */
    }
  });

  watch(
    state,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        /* storage unavailable: filters simply do not persist */
      }
    },
    { deep: true },
  );

  return { filterFor, isActive, activeStorages };
}
