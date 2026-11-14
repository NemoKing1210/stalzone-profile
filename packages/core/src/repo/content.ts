import type { Db } from '../db/index.js';

export interface ContentBlockRow {
  id: number;
  kind: string;
  slug: string | null;
  title: string | null;
  lead: string | null;
  payload: string;
  position: number;
  updated_at: string;
}

export interface ContentBlockInput {
  kind: string;
  slug?: string | null;
  title?: string | null;
  lead?: string | null;
  payload: unknown;
  position?: number;
}

export function getBlock(db: Db, kind: string, slug?: string | null): ContentBlockRow | null {
  if (slug == null) {
    return (
      (db.prepare(`SELECT * FROM content_block WHERE kind = ? AND slug IS NULL`).get(kind) as
        | ContentBlockRow
        | undefined) ?? null
    );
  }
  return (
    (db
      .prepare(`SELECT * FROM content_block WHERE kind = ? AND COALESCE(slug, '') = ?`)
      .get(kind, slug) as ContentBlockRow | undefined) ?? null
  );
}

export function listBlocks(db: Db, kind: string): ContentBlockRow[] {
  return db.prepare(`SELECT * FROM content_block WHERE kind = ? ORDER BY position, id`).all(kind) as ContentBlockRow[];
}

export function putBlock(db: Db, input: ContentBlockInput): number {
  const existing = getBlock(db, input.kind, input.slug ?? null);
  const now = new Date().toISOString();
  const payload = JSON.stringify(input.payload ?? null);
  if (existing) {
    db.prepare(
      `UPDATE content_block SET title = @title, lead = @lead, payload = @payload, position = @position,
        updated_at = @updated_at WHERE id = @id`,
    ).run({
      title: input.title ?? null,
      lead: input.lead ?? null,
      payload,
      position: input.position ?? existing.position,
      updated_at: now,
      id: existing.id,
    });
    return existing.id;
  }
  const info = db
    .prepare(
      `INSERT INTO content_block (kind, slug, title, lead, payload, position, updated_at)
       VALUES (@kind, @slug, @title, @lead, @payload, @position, @updated_at)`,
    )
    .run({
      kind: input.kind,
      slug: input.slug ?? null,
      title: input.title ?? null,
      lead: input.lead ?? null,
      payload,
      position: input.position ?? 0,
      updated_at: now,
    });
  return Number(info.lastInsertRowid);
}

export function deleteBlock(db: Db, kind: string, slug?: string | null): boolean {
  const info =
    slug == null
      ? db.prepare(`DELETE FROM content_block WHERE kind = ? AND slug IS NULL`).run(kind)
      : db.prepare(`DELETE FROM content_block WHERE kind = ? AND COALESCE(slug, '') = ?`).run(kind, slug);
  return info.changes > 0;
}

export function blockPayload<T = unknown>(row: ContentBlockRow | null): T | null {
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export function clearBlocks(db: Db, kind?: string): void {
  if (kind) db.prepare(`DELETE FROM content_block WHERE kind = ?`).run(kind);
  else db.exec(`DELETE FROM content_block`);
}
