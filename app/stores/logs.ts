import { useMutation, useQuery } from '@pinia/colada';
import { defineStore } from 'pinia';
import type { LogQueryResult, LogStats, WriteResult } from '@profile/shared/contracts';

import { QUERY_KEYS } from './keys';

/** The diagnostic log's read and dry-run paths; the real purge stays on `useWrite`. */
export const useLogsStore = defineStore('logs', () => {
  const page = useMutation({
    mutation: ({ query }: { query: Record<string, unknown> }) =>
      $fetch<LogQueryResult>('/api/v1/logs', { query }),
  });
  const statsQuery = useQuery({
    key: QUERY_KEYS.logStats,
    query: () => $fetch<LogStats>('/api/v1/logs/stats'),
    enabled: false,
  });
  const preview = useMutation({
    mutation: (body: Record<string, unknown>) =>
      $fetch<WriteResult>('/api/v1/logs', { method: 'DELETE', body: { ...body, dryRun: true } }),
  });

  return {
    loadPage: page.mutateAsync,
    stats: statsQuery.data,
    loadStats: statsQuery.refetch,
    previewPurge: preview.mutateAsync,
  };
});
