import type { SyncResult } from '@profile/shared/contracts';

export const PROFILE_SYNC_URL = '/api/v1/admin/sync';

/** The same admin sync call Settings → Sources makes, for the profile source only. */
export function profileSyncRequest(): { url: string; method: 'POST'; body: { source: 'profile' } } {
  return { url: PROFILE_SYNC_URL, method: 'POST', body: { source: 'profile' } };
}

export type ProfileSyncFailureKind = 'unconfigured' | 'not-found' | 'busy' | 'unknown';

export interface ProfileSyncFailure {
  kind: ProfileSyncFailureKind;
  code: string | null;
  message: string | null;
}

export interface ProfileSyncOutcome {
  ok: boolean;
  items: number;
  fetchedAt: string | null;
  failure: ProfileSyncFailure | null;
}

/** A failed run is a `stale` result; the UI needs the kind, not the raw transport string. */
export function classifyProfileSyncFailure(
  raw: string | null | undefined,
  statusCode: number | null = null,
  code: string | null = null,
): ProfileSyncFailure {
  const codeValue = code ?? null;
  const text = raw ?? '';
  if (codeValue === 'STALZONE_API_NOT_CONFIGURED' || text === 'STALZONE_API_NOT_CONFIGURED') {
    return { kind: 'unconfigured', code: codeValue ?? 'STALZONE_API_NOT_CONFIGURED', message: text || null };
  }
  if (codeValue === 'SYNC_IN_PROGRESS' || text === 'SYNC_IN_PROGRESS') {
    return { kind: 'busy', code: codeValue ?? 'SYNC_IN_PROGRESS', message: text || null };
  }
  if (statusCode === 404 || /\bHTTP\s+404\b|\b404\b/.test(text)) {
    return { kind: 'not-found', code: codeValue, message: text || null };
  }
  return { kind: 'unknown', code: codeValue, message: text || null };
}

/** Maps the route's `{ results }` payload; a missing profile result is an unknown failure. */
export function profileSyncOutcome(results: SyncResult[]): ProfileSyncOutcome {
  const result = results.find((entry) => entry.source === 'profile');
  if (!result) {
    return {
      ok: false,
      items: 0,
      fetchedAt: null,
      failure: { kind: 'unknown', code: null, message: null },
    };
  }
  if (result.status === 'ok') {
    return { ok: true, items: result.items, fetchedAt: result.fetchedAt ?? null, failure: null };
  }
  return {
    ok: false,
    items: result.items,
    fetchedAt: result.fetchedAt ?? null,
    failure: classifyProfileSyncFailure(result.error, null),
  };
}

interface ProfileSyncErrorShape {
  statusCode?: number;
  status?: number;
  message?: string;
  data?: { error?: { code?: string; message?: string } };
}

/** Classifies a rejected `$fetch` (origin, session, an in-flight lock) as the same failure kinds. */
export function profileSyncFailureFromError(error: unknown): ProfileSyncFailure {
  const record = (error ?? null) as ProfileSyncErrorShape | null;
  const code = record?.data?.error?.code ?? null;
  const message = record?.data?.error?.message ?? record?.message ?? null;
  return classifyProfileSyncFailure(message, record?.statusCode ?? record?.status ?? null, code);
}
