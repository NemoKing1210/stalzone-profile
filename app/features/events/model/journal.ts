import type { EventRead } from '@profile/shared/contracts';

export type EventWindow = 'all' | '24h' | '7d' | '30d';

export const EVENT_WINDOWS: readonly EventWindow[] = ['all', '24h', '7d', '30d'];

const WINDOW_MS: Record<Exclude<EventWindow, 'all'>, number> = {
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
};

/** Known origins, matching what `handleWrite` stores. Unknown strings stay visible as-is. */
export const EVENT_ORIGINS = ['http', 'api', 'mcp', 'cli'] as const;

export interface EventFilters {
  text: string;
  /** Empty string means "every action". */
  action: string;
  entity: string;
  actor: string;
  window: EventWindow;
}

export const EMPTY_EVENT_FILTERS: EventFilters = {
  text: '',
  action: '',
  entity: '',
  actor: '',
  window: 'all',
};

export interface EventFacets {
  actions: string[];
  entities: string[];
  actors: string[];
}

/** Distinct filter values of the loaded page, sorted for a stable select. */
export function eventFacets(events: readonly EventRead[]): EventFacets {
  const actions = new Set<string>();
  const entities = new Set<string>();
  const actors = new Set<string>();
  for (const event of events) {
    if (event.action) actions.add(event.action);
    if (event.entity) entities.add(event.entity);
    if (event.actor) actors.add(event.actor);
  }
  return {
    actions: [...actions].sort(),
    entities: [...entities].sort(),
    actors: [...actors].sort(),
  };
}

export function filterEvents(
  events: readonly EventRead[],
  filters: EventFilters,
  now = new Date(),
): EventRead[] {
  const since = filters.window === 'all' ? null : now.getTime() - WINDOW_MS[filters.window];
  const needle = filters.text.trim().toLowerCase();
  return events.filter((event) => {
    if (filters.action && event.action !== filters.action) return false;
    if (filters.entity && event.entity !== filters.entity) return false;
    if (filters.actor && event.actor !== filters.actor) return false;
    if (since !== null) {
      const at = Date.parse(event.at);
      if (!Number.isFinite(at) || at < since) return false;
    }
    if (!needle) return true;
    return [
      event.action,
      event.entity ?? '',
      event.entityId ?? '',
      event.actor,
      event.note ?? '',
      event.requestId ?? '',
      event.origin ?? '',
    ]
      .join('\n')
      .toLowerCase()
      .includes(needle);
  });
}

export type DiffKind = 'added' | 'removed' | 'changed';

export interface DiffEntry {
  /** Dot path from the snapshot root; empty for a non-object root. */
  path: string;
  before: unknown;
  after: unknown;
  kind: DiffKind;
}

export interface DiffResult {
  entries: DiffEntry[];
  truncated: boolean;
}

export const DIFF_ENTRY_LIMIT = 100;

function text(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

function walk(
  before: unknown,
  after: unknown,
  path: string,
  entries: DiffEntry[],
  limit: number,
): boolean {
  // A missing side of a create/delete reads as an empty object, so its fields stay readable.
  const beforeObject =
    typeof before === 'object' && before !== null && !Array.isArray(before)
      ? (before as Record<string, unknown>)
      : before == null
        ? {}
        : null;
  const afterObject =
    typeof after === 'object' && after !== null && !Array.isArray(after)
      ? (after as Record<string, unknown>)
      : after == null
        ? {}
        : null;
  if (beforeObject && afterObject) {
    for (const key of new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)])) {
      const ok = walk(beforeObject[key], afterObject[key], path ? `${path}.${key}` : key, entries, limit);
      if (!ok) return false;
    }
    return true;
  }
  if (before === after || text(before) === text(after)) return true;
  if (entries.length >= limit) return false;
  entries.push({
    path,
    before,
    after,
    kind: before === undefined ? 'added' : after === undefined ? 'removed' : 'changed',
  });
  return true;
}

/** Readable field-level differences between the rollback snapshots, in snapshot order. */
export function diffEntries(before: unknown, after: unknown, limit = DIFF_ENTRY_LIMIT): DiffResult {
  const entries: DiffEntry[] = [];
  const complete = walk(before, after, '', entries, limit);
  return { entries, truncated: !complete };
}

export function formatDiffValue(value: unknown, maxLength = 64): string {
  if (value === undefined) return '';
  const valueText = typeof value === 'string' ? value : text(value);
  return valueText.length > maxLength ? `${valueText.slice(0, maxLength - 1)}…` : valueText;
}

export function prettySnapshot(value: unknown, maxLength = 8_000): { text: string; truncated: boolean } {
  const snapshot = value === undefined ? '' : JSON.stringify(value, null, 2) ?? String(value);
  if (snapshot.length <= maxLength) return { text: snapshot, truncated: false };
  return { text: snapshot.slice(0, maxLength), truncated: true };
}
