import type {
  SyncBundleId,
  SyncBundleReason,
  SyncBundleState,
  SyncScheduleValues,
} from '@profile/shared/contracts';
import type { SourceRow, SourceId } from '../repo/sources.js';

type BundleSource = Exclude<SourceId, 'local'>;

/** Bundles group sources that change together, so one interval governs one kind of refresh. */
export const SYNC_BUNDLES: Record<SyncBundleId, readonly BundleSource[]> = {
  catalog: ['exbo_base', 'wiki', 'motifs', 'icons'],
  prices: ['scpmodel'],
  profile: ['profile'],
};

const BUNDLE_ORDER: readonly SyncBundleId[] = ['catalog', 'prices', 'profile'];

export interface SyncRuntime {
  profileApiConfigured: boolean;
  hasCharacter: boolean;
  characterRegion: string | null;
}

function bundleLastRunAt(sources: SourceRow[], members: readonly BundleSource[]): string | null {
  let latest = Number.NEGATIVE_INFINITY;
  for (const source of sources) {
    if (!members.includes(source.id as BundleSource) || !source.last_try_at) continue;
    const at = Date.parse(source.last_try_at);
    if (Number.isFinite(at) && at > latest) latest = at;
  }
  return latest === Number.NEGATIVE_INFINITY ? null : new Date(latest).toISOString();
}

function bundleBlocker(
  id: SyncBundleId,
  schedule: SyncScheduleValues,
  intervalMin: number,
  runtime: SyncRuntime,
): SyncBundleReason | null {
  if (!schedule.enabled) return 'disabled';
  if (intervalMin === 0) return 'off';
  if (id !== 'profile') return null;
  if (!runtime.profileApiConfigured) return 'profile_credentials';
  if (!runtime.hasCharacter) return 'profile_character';
  if (runtime.characterRegion === 'global') return 'profile_region';
  return null;
}

function intervalFor(id: SyncBundleId, schedule: SyncScheduleValues): number {
  if (id === 'catalog') return schedule.catalogEveryMin;
  if (id === 'prices') return schedule.pricesEveryMin;
  return schedule.profileEveryMin;
}

/** Pure: the clock is injected, so due behavior is testable without timers. */
export function syncBundleStates(
  schedule: SyncScheduleValues,
  sources: SourceRow[],
  runtime: SyncRuntime,
  now: number,
): SyncBundleState[] {
  return BUNDLE_ORDER.map((id) => {
    const intervalMin = intervalFor(id, schedule);
    const reason = bundleBlocker(id, schedule, intervalMin, runtime);
    const lastRunAt = bundleLastRunAt(sources, SYNC_BUNDLES[id]);
    const nextRunAt =
      reason === null
        ? new Date(lastRunAt === null ? now : Date.parse(lastRunAt) + intervalMin * 60_000).toISOString()
        : null;
    return { id, intervalMin, lastRunAt, nextRunAt, ready: reason === null, reason };
  });
}

export function dueSyncBundles(states: SyncBundleState[], now: number): SyncBundleId[] {
  return states
    .filter((state) => state.ready && state.nextRunAt !== null && Date.parse(state.nextRunAt) <= now)
    .map((state) => state.id);
}
