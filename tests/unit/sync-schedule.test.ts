import { describe, expect, it } from 'vitest';
import { dueSyncBundles, syncBundleStates, type SourceRow } from '@profile/core';
import { SyncScheduleSchema, SyncScheduleUpdateSchema } from '@profile/shared/contracts';

const values = { enabled: true, catalogEveryMin: 360, pricesEveryMin: 60, profileEveryMin: 0 };

describe('sync schedule contract', () => {
  it('accepts off and the 15..10080 minute window', () => {
    for (const catalogEveryMin of [0, 15, 60, 10080]) {
      expect(SyncScheduleUpdateSchema.safeParse({ ...values, catalogEveryMin }).success).toBe(true);
    }
  });

  it('rejects 1..14 and more than a week', () => {
    for (const catalogEveryMin of [1, 14, 10081]) {
      expect(SyncScheduleUpdateSchema.safeParse({ ...values, catalogEveryMin }).success).toBe(false);
    }
  });

  it('defaults dryRun to false and keeps updatedAt out of the write body', () => {
    const parsed = SyncScheduleUpdateSchema.parse(values);
    expect(parsed.dryRun).toBe(false);
    expect(SyncScheduleSchema.parse({ ...values, updatedAt: '2026-11-17T00:00:00.000Z' })).toMatchObject(values);
  });
});

const NOW = Date.parse('2026-11-17T12:00:00.000Z');

function row(id: string, lastTryAt: string | null): SourceRow {
  return {
    id,
    kind: 'reference',
    url: null,
    status: 'ok',
    last_ok_at: lastTryAt,
    last_try_at: lastTryAt,
    last_error: null,
    commit_sha: null,
    commit_date: null,
    updated_at: lastTryAt ?? '2026-01-01T00:00:00.000Z',
  };
}

const ready = { profileApiConfigured: true, hasCharacter: true, characterRegion: 'ru' };
const schedule = { enabled: true, catalogEveryMin: 60, pricesEveryMin: 15, profileEveryMin: 60 };

describe('sync bundle state', () => {
  it('marks a never-run bundle due now', () => {
    const states = syncBundleStates(schedule, [row('exbo_base', null)], { ...ready, profileApiConfigured: false }, NOW);
    const catalog = states.find((state) => state.id === 'catalog')!;
    expect(catalog).toMatchObject({ ready: true, lastRunAt: null, nextRunAt: new Date(NOW).toISOString() });
  });

  it('uses the latest try across bundle members', () => {
    const sources = [
      row('exbo_base', '2026-11-17T11:30:00.000Z'),
      row('wiki', '2026-11-17T11:10:00.000Z'),
      row('motifs', '2026-11-17T11:20:00.000Z'),
      row('icons', '2026-11-17T11:40:00.000Z'),
    ];
    const catalog = syncBundleStates(schedule, sources, ready, NOW).find((state) => state.id === 'catalog')!;
    expect(catalog.lastRunAt).toBe('2026-11-17T11:40:00.000Z');
    expect(catalog.nextRunAt).toBe('2026-11-17T12:40:00.000Z');
  });

  it('reports the first blocker for the profile bundle', () => {
    expect(
      syncBundleStates(schedule, [], { ...ready, profileApiConfigured: false }, NOW).find((s) => s.id === 'profile')!
        .reason,
    ).toBe('profile_credentials');
    expect(
      syncBundleStates(schedule, [], { ...ready, hasCharacter: false }, NOW).find((s) => s.id === 'profile')!.reason,
    ).toBe('profile_character');
    expect(
      syncBundleStates(schedule, [], { ...ready, characterRegion: 'global' }, NOW).find((s) => s.id === 'profile')!
        .reason,
    ).toBe('profile_region');
  });

  it('turns every bundle off when the master switch is off or the interval is zero', () => {
    const off = syncBundleStates({ ...schedule, enabled: false }, [], ready, NOW);
    expect(off.every((state) => !state.ready && state.reason === 'disabled' && state.nextRunAt === null)).toBe(true);
    const zero = syncBundleStates({ ...schedule, pricesEveryMin: 0 }, [], ready, NOW).find(
      (state) => state.id === 'prices',
    )!;
    expect(zero.reason).toBe('off');
    expect(zero.nextRunAt).toBeNull();
  });

  it('selects only ready bundles whose next run has passed', () => {
    const states = syncBundleStates(
      schedule,
      [row('exbo_base', '2026-11-17T11:00:00.000Z'), row('scpmodel', '2026-11-17T11:50:00.000Z')],
      { ...ready, profileApiConfigured: false },
      NOW,
    );
    expect(dueSyncBundles(states, NOW)).toEqual(['catalog']);
    expect(dueSyncBundles(states, NOW + 6 * 60_000)).toEqual(['catalog', 'prices']);
  });
});
