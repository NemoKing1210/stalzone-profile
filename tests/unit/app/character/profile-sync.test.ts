import { describe, expect, it } from 'vitest';
import {
  classifyProfileSyncFailure,
  profileSyncFailureFromError,
  profileSyncOutcome,
  profileSyncRequest,
} from '../../../../app/features/character/model/profileSync';

describe('profile sync request', () => {
  it('posts the profile source to the admin sync route', () => {
    expect(profileSyncRequest()).toEqual({
      url: '/api/v1/admin/sync',
      method: 'POST',
      body: { source: 'profile' },
    });
  });
});

describe('profile sync result mapping', () => {
  it('reports a successful run with its item count and timestamp', () => {
    const outcome = profileSyncOutcome([
      { source: 'profile', status: 'ok', items: 7, fetchedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    expect(outcome).toEqual({
      ok: true,
      items: 7,
      fetchedAt: '2026-01-01T00:00:00.000Z',
      failure: null,
    });
  });

  it('turns a stale result into the actionable failure kind', () => {
    const unconfigured = profileSyncOutcome([
      { source: 'profile', status: 'stale', items: 0, error: 'STALZONE_API_NOT_CONFIGURED' },
    ]);
    expect(unconfigured.ok).toBe(false);
    expect(unconfigured.failure?.kind).toBe('unconfigured');

    const missing = profileSyncOutcome([{ source: 'profile', status: 'stale', items: 0, error: 'HTTP 404' }]);
    expect(missing.failure?.kind).toBe('not-found');
  });

  it('treats a missing profile result as an unknown failure', () => {
    expect(profileSyncOutcome([])).toMatchObject({ ok: false, failure: { kind: 'unknown' } });
  });
});

describe('profile sync transport errors', () => {
  it('classifies a rejected fetch by its error envelope', () => {
    expect(
      profileSyncFailureFromError({
        statusCode: 409,
        data: { error: { code: 'SYNC_IN_PROGRESS', message: 'a sync is running' } },
      }),
    ).toMatchObject({ kind: 'busy', code: 'SYNC_IN_PROGRESS' });

    expect(
      profileSyncFailureFromError({
        statusCode: 404,
        data: { error: { code: 'VALIDATION', message: 'HTTP 404' } },
      }),
    ).toMatchObject({ kind: 'not-found' });

    expect(
      profileSyncFailureFromError({ data: { error: { code: 'STALZONE_API_NOT_CONFIGURED' } } }),
    ).toMatchObject({ kind: 'unconfigured' });
  });

  it('falls back to unknown for anything else', () => {
    expect(classifyProfileSyncFailure('socket hang up', 500)).toMatchObject({ kind: 'unknown' });
  });
});
