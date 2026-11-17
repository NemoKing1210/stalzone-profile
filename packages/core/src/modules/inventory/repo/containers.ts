import type { Db } from '../../../platform/db/index.js';

export interface ContainerDataRow {
  item_id: number;
  type: string | null;
  shield: number | null;
  bonus: string | null;
  protection: number | null;
  slots: number | null;
  eff: number | null;
  updated_at: string;
}

export interface ContainerDataInput {
  type?: string | null;
  shield?: number | null;
  bonus?: string | null;
  protection?: number | null;
  slots?: number | null;
  eff?: number | null;
}

export function upsertContainerData(db: Db, itemId: number, input: ContainerDataInput): void {
  db.prepare(
    `INSERT INTO container_data (item_id, type, shield, bonus, protection, slots, eff, updated_at)
     VALUES (@item_id, @type, @shield, @bonus, @protection, @slots, @eff, @updated_at)
     ON CONFLICT(item_id) DO UPDATE SET
       type = excluded.type,
       shield = excluded.shield,
       bonus = excluded.bonus,
       protection = excluded.protection,
       slots = excluded.slots,
       eff = excluded.eff,
       updated_at = excluded.updated_at`,
  ).run({
    item_id: itemId,
    type: input.type ?? null,
    shield: input.shield ?? null,
    bonus: input.bonus ?? null,
    protection: input.protection ?? null,
    slots: input.slots ?? null,
    eff: input.eff ?? null,
    updated_at: new Date().toISOString(),
  });
}

export function getContainerData(db: Db, itemId: number): ContainerDataRow | null {
  return (db.prepare(`SELECT * FROM container_data WHERE item_id = ?`).get(itemId) as ContainerDataRow | undefined) ?? null;
}

export function deleteContainerData(db: Db, itemId: number): void {
  db.prepare(`DELETE FROM container_data WHERE item_id = ?`).run(itemId);
}

/** Restores container data exactly as it was, including its `updated_at`. */
export function restoreContainerDataRow(db: Db, row: ContainerDataRow): void {
  db.prepare(
    `INSERT INTO container_data (item_id, type, shield, bonus, protection, slots, eff, updated_at)
     VALUES (@item_id, @type, @shield, @bonus, @protection, @slots, @eff, @updated_at)
     ON CONFLICT(item_id) DO UPDATE SET
       type = excluded.type,
       shield = excluded.shield,
       bonus = excluded.bonus,
       protection = excluded.protection,
       slots = excluded.slots,
       eff = excluded.eff,
       updated_at = excluded.updated_at`,
  ).run(row);
}
