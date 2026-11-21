import type { Db } from '../../../platform/db/index.js';
import { cachedStatement } from '../../../platform/db/index.js';

export type StatValueType = 'INTEGER' | 'DECIMAL' | 'DATE' | 'DURATION' | 'TEXT';

export interface StatDefinitionRow {
  id: string;
  category: string | null;
  value_type: StatValueType | null;
  label_ru: string | null;
  label_en: string | null;
  updated_at: string;
}

export interface StatDefinitionInput {
  id: string;
  category?: string | null;
  valueType?: StatValueType | null;
  labelRu?: string | null;
  labelEn?: string | null;
}

export function upsertStatDefinition(db: Db, input: StatDefinitionInput): void {
  cachedStatement(
    db,
    `INSERT INTO stat_definition (id, category, value_type, label_ru, label_en, updated_at)
     VALUES (@id, @category, @value_type, @label_ru, @label_en, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       category = COALESCE(excluded.category, stat_definition.category),
       value_type = COALESCE(excluded.value_type, stat_definition.value_type),
       label_ru = COALESCE(excluded.label_ru, stat_definition.label_ru),
       label_en = COALESCE(excluded.label_en, stat_definition.label_en),
       updated_at = excluded.updated_at`,
  ).run({
    id: input.id,
    category: input.category ?? null,
    value_type: input.valueType ?? null,
    label_ru: input.labelRu ?? null,
    label_en: input.labelEn ?? null,
    updated_at: new Date().toISOString(),
  });
}

const ensured = new WeakMap<Db, Set<string>>();

export function ensureStatDefinition(db: Db, id: string): void {
  let ids = ensured.get(db);
  if (!ids) {
    ids = new Set();
    ensured.set(db, ids);
  }
  if (ids.has(id)) return;
  upsertStatDefinition(db, { id });
  ids.add(id);
}

export function getStatDefinition(db: Db, id: string): StatDefinitionRow | null {
  return (
    (cachedStatement(db, `SELECT * FROM stat_definition WHERE id = ?`).get(id) as StatDefinitionRow | undefined) ??
    null
  );
}

export function listStatDefinitions(db: Db): StatDefinitionRow[] {
  return db.prepare(`SELECT * FROM stat_definition ORDER BY id`).all() as StatDefinitionRow[];
}

export interface StatUsageRow {
  id: string;
  count: number;
  label: string | null;
  pct: number | null;
  positive: number | null;
  kinds: string;
}

/** Which stat ids are actually populated, optionally within one item kind. */
export function statUsage(db: Db, kind?: string): StatUsageRow[] {
  const where = kind ? 'WHERE i.kind = @kind' : '';
  const statement = db.prepare(
    `SELECT s.stat_id AS id, COUNT(*) AS count, MAX(s.label) AS label,
            MAX(s.pct) AS pct, MAX(s.is_positive) AS positive,
            GROUP_CONCAT(DISTINCT i.kind) AS kinds
       FROM item_stat s
       JOIN item i ON i.id = s.item_id
       ${where}
      GROUP BY s.stat_id
      ORDER BY count DESC, id`,
  );
  return (kind ? statement.all({ kind }) : statement.all()) as StatUsageRow[];
}
