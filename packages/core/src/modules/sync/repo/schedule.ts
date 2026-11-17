import type { SyncSchedule, SyncScheduleValues } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';

export interface ScheduleRow {
  id: number;
  enabled: number;
  catalog_every_min: number;
  prices_every_min: number;
  profile_every_min: number;
  updated_at: string;
}

export const DEFAULT_SYNC_VALUES: SyncScheduleValues = {
  enabled: false,
  catalogEveryMin: 360,
  pricesEveryMin: 60,
  profileEveryMin: 0,
};

export function getScheduleRow(db: Db): ScheduleRow | null {
  return (db.prepare('SELECT * FROM sync_schedule WHERE id = 1').get() as ScheduleRow | undefined) ?? null;
}

/** Tolerates a missing row: a migration normally inserts it, defaults keep reads total. */
export function readSyncSchedule(db: Db): SyncSchedule {
  const row = getScheduleRow(db);
  if (!row) return { ...DEFAULT_SYNC_VALUES, updatedAt: new Date().toISOString() };
  return {
    enabled: row.enabled === 1,
    catalogEveryMin: row.catalog_every_min,
    pricesEveryMin: row.prices_every_min,
    profileEveryMin: row.profile_every_min,
    updatedAt: row.updated_at,
  };
}

export function writeSyncScheduleRow(db: Db, values: SyncScheduleValues, at = new Date().toISOString()): void {
  db.prepare(
    `INSERT INTO sync_schedule (id, enabled, catalog_every_min, prices_every_min, profile_every_min, updated_at)
     VALUES (1, @enabled, @catalogEveryMin, @pricesEveryMin, @profileEveryMin, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       enabled = excluded.enabled,
       catalog_every_min = excluded.catalog_every_min,
       prices_every_min = excluded.prices_every_min,
       profile_every_min = excluded.profile_every_min,
       updated_at = excluded.updated_at`,
  ).run({
    enabled: values.enabled ? 1 : 0,
    catalogEveryMin: values.catalogEveryMin,
    pricesEveryMin: values.pricesEveryMin,
    profileEveryMin: values.profileEveryMin,
    updatedAt: at,
  });
}
