import type { Db } from '../../../platform/db/index.js';

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
  db.prepare(
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

export function ensureStatDefinition(db: Db, id: string): void {
  upsertStatDefinition(db, { id });
}

export function getStatDefinition(db: Db, id: string): StatDefinitionRow | null {
  return (db.prepare(`SELECT * FROM stat_definition WHERE id = ?`).get(id) as StatDefinitionRow | undefined) ?? null;
}

export function listStatDefinitions(db: Db): StatDefinitionRow[] {
  return db.prepare(`SELECT * FROM stat_definition ORDER BY id`).all() as StatDefinitionRow[];
}
