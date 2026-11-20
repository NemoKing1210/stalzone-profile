/** Query keys are serialisable snapshots, so invalidation never depends on an object identity. */
export const QUERY_KEYS = {
  profile: ['profile', 'payload'] as const,
  logs: ['logs', 'page'] as const,
  logStats: ['logs', 'stats'] as const,
  logConfig: ['logs', 'config'] as const,
  syncDiagnostics: ['sync', 'diagnostics'] as const,
  setup: ['setup', 'state'] as const,
  events: ['events', 'list'] as const,
  cleanup: ['cleanup', 'counts'] as const,
  catalogItems: ['catalog', 'items'] as const,
};

export function profileQueryKey(): readonly string[] {
  return QUERY_KEYS.profile;
}
