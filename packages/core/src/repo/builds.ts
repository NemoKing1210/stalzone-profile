import type { Db } from '../db/index.js';

export interface BuildRow {
  id: number;
  slug: string;
  title: string;
  short: string | null;
  tag: string | null;
  goal: string | null;
  container_item_id: number | null;
  slots: number | null;
  eff: number | null;
  budget: number | null;
  total: number | null;
  metrics: string | null;
  verdict: string | null;
  position: number;
  updated_at: string;
}

export interface BuildSlotRow {
  build_id: number;
  position: number;
  item_id: number | null;
  label: string | null;
  quality: string | null;
  rank: string | null;
  price: number | null;
  lots: number | null;
  eff: string | null;
  bonus: string | null;
  minus: string | null;
  why: string | null;
  item_name?: string | null;
  item_rank?: string | null;
  item_icon?: string | null;
}

export interface BuildInput {
  slug: string;
  title: string;
  short?: string | null;
  tag?: string | null;
  goal?: string | null;
  containerItemId?: number | null;
  slots?: number | null;
  eff?: number | null;
  budget?: number | null;
  total?: number | null;
  metrics?: unknown;
  verdict?: string | null;
  position?: number;
  rows?: {
    itemId?: number | null;
    label?: string | null;
    quality?: string | null;
    rank?: string | null;
    price?: number | null;
    lots?: number | null;
    eff?: string | null;
    bonus?: string | null;
    minus?: string | null;
    why?: string | null;
  }[];
}

export function getBuild(db: Db, slug: string): BuildRow | null {
  return (db.prepare(`SELECT * FROM build WHERE slug = ?`).get(slug) as BuildRow | undefined) ?? null;
}

export function getBuildById(db: Db, id: number): BuildRow | null {
  return (db.prepare(`SELECT * FROM build WHERE id = ?`).get(id) as BuildRow | undefined) ?? null;
}

export function listBuilds(db: Db): BuildRow[] {
  return db.prepare(`SELECT * FROM build ORDER BY position, id`).all() as BuildRow[];
}

export function listBuildSlots(db: Db, buildId: number): BuildSlotRow[] {
  return db
    .prepare(
      `SELECT bs.*, i.name AS item_name, i.rank AS item_rank, i.icon_path AS item_icon
       FROM build_slot bs LEFT JOIN item i ON i.id = bs.item_id
       WHERE bs.build_id = ? ORDER BY bs.position`,
    )
    .all(buildId) as BuildSlotRow[];
}

export function allBuildSlots(db: Db): Record<number, BuildSlotRow[]> {
  const rows = db
    .prepare(
      `SELECT bs.*, i.name AS item_name, i.rank AS item_rank, i.icon_path AS item_icon
       FROM build_slot bs LEFT JOIN item i ON i.id = bs.item_id
       ORDER BY bs.build_id, bs.position`,
    )
    .all() as BuildSlotRow[];
  const out: Record<number, BuildSlotRow[]> = {};
  for (const row of rows) (out[row.build_id] ||= []).push(row);
  return out;
}

export function saveBuild(db: Db, input: BuildInput): { id: number; created: boolean } {
  const now = new Date().toISOString();
  const existing = getBuild(db, input.slug);
  const values = {
    slug: input.slug,
    title: input.title,
    short: input.short ?? null,
    tag: input.tag ?? null,
    goal: input.goal ?? null,
    container_item_id: input.containerItemId ?? null,
    slots: input.slots ?? null,
    eff: input.eff ?? null,
    budget: input.budget ?? null,
    total: input.total ?? null,
    metrics: input.metrics === undefined ? null : JSON.stringify(input.metrics),
    verdict: input.verdict ?? null,
    position: input.position ?? 0,
    updated_at: now,
  };

  let id: number;
  const run = db.transaction(() => {
    if (existing) {
      db.prepare(
        `UPDATE build SET title = @title, short = @short, tag = @tag, goal = @goal,
          container_item_id = @container_item_id, slots = @slots, eff = @eff, budget = @budget, total = @total,
          metrics = @metrics, verdict = @verdict, position = @position, updated_at = @updated_at
         WHERE id = @id`,
      ).run({ ...values, id: existing.id });
      id = existing.id;
      db.prepare(`DELETE FROM build_slot WHERE build_id = ?`).run(id);
    } else {
      const cols = Object.keys(values);
      const info = db
        .prepare(`INSERT INTO build (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`)
        .run(values);
      id = Number(info.lastInsertRowid);
    }
    const slotStmt = db.prepare(
      `INSERT INTO build_slot (build_id, position, item_id, label, quality, rank, price, lots, eff, bonus, minus, why)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    (input.rows ?? []).forEach((row, index) => {
      slotStmt.run(
        id,
        index,
        row.itemId ?? null,
        row.label ?? null,
        row.quality ?? null,
        row.rank ?? null,
        row.price ?? null,
        row.lots ?? null,
        row.eff ?? null,
        row.bonus ?? null,
        row.minus ?? null,
        row.why ?? null,
      );
    });
  });
  run();
  return { id: id!, created: !existing };
}

export function deleteBuild(db: Db, slug: string): boolean {
  const info = db.prepare(`DELETE FROM build WHERE slug = ?`).run(slug);
  return info.changes > 0;
}

export function clearBuilds(db: Db): void {
  db.exec(`DELETE FROM build`);
}
