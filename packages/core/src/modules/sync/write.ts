import {
  SyncScheduleValuesSchema,
  type SyncScheduleUpdate,
  type SyncScheduleValues,
  type WriteResult,
} from '@profile/shared/contracts';
import type { Db } from '../../platform/db/index.js';
import { logEvent, withTransaction, WriteError } from '../../platform/journal/index.js';
import { readSyncSchedule, writeSyncScheduleRow } from './repo/schedule.js';

function intervalLabel(minutes: number): string {
  return minutes === 0 ? 'off' : `${minutes} min`;
}

function human(values: SyncScheduleValues): string {
  const state = values.enabled ? 'enabled' : 'disabled';
  return `Auto-sync ${state}: catalog ${intervalLabel(values.catalogEveryMin)}, prices ${intervalLabel(
    values.pricesEveryMin,
  )}, profile ${intervalLabel(values.profileEveryMin)}`;
}

function valuesOf(schedule: SyncScheduleValues): SyncScheduleValues {
  return {
    enabled: schedule.enabled,
    catalogEveryMin: schedule.catalogEveryMin,
    pricesEveryMin: schedule.pricesEveryMin,
    profileEveryMin: schedule.profileEveryMin,
  };
}

/** The schedule is settings, not profile content: it is persisted and rollbackable like any write. */
export function setSyncSchedule(db: Db, input: SyncScheduleUpdate): WriteResult {
  const parsed = SyncScheduleValuesSchema.safeParse(input);
  if (!parsed.success) {
    throw new WriteError(422, 'INVALID_SCHEDULE', 'Invalid sync schedule', parsed.error.issues);
  }

  const after = parsed.data;
  const before = valuesOf(readSyncSchedule(db));
  const diff = { before, after, human: human(after) };

  const unchanged =
    before.enabled === after.enabled &&
    before.catalogEveryMin === after.catalogEveryMin &&
    before.pricesEveryMin === after.pricesEveryMin &&
    before.profileEveryMin === after.profileEveryMin;

  if (unchanged) return { dryRun: input.dryRun, diff, eventId: undefined };
  if (input.dryRun) return { dryRun: true, diff };

  const eventId = withTransaction(db, () => {
    writeSyncScheduleRow(db, after);
    return logEvent(db, {
      actor: 'owner',
      action: 'sync.schedule.update',
      entity: 'sync_schedule',
      entityId: 1,
      before,
      after,
    });
  });

  return { dryRun: false, diff, eventId };
}
